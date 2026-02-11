import { NextResponse } from 'next/server';
import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';
import { prisma } from '@kit/prisma';
import { requireSession } from '~/lib/auth/get-session';
import type { VapiSquadTemplate, VapiAssistantTemplate } from '@prisma/client';

/**
 * POST /api/vapi/phone-numbers
 * 
 * Assign a phone number to an account and link it to a preset squad/assistant
 * 
 * Authentication: Required (uses current user's account)
 * 
 * Body:
 * {
 *   squadTemplateId?: string  // ID of preset squad (OR assistantTemplateId)
 *   assistantTemplateId?: string  // ID of preset assistant (OR squadTemplateId)
 *   areaCode?: string  // Preferred area code (will purchase new number)
 *   phoneNumber?: string  // Use existing Twilio number
 *   friendlyName?: string
 *   customConfig?: object  // Account-specific overrides
 * }
 * 
 * Example:
 * {
 *   "squadTemplateId": "squad_dental_clinic",
 *   "areaCode": "415",
 *   "friendlyName": "Main Office Line"
 * }
 */
export async function POST(request: Request) {
  const logger = await getLogger();

  try {
    // 1. AUTHENTICATION: Get current user
    const session = await requireSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get user's account
    const membership = await prisma.accountMembership.findFirst({
      where: { userId: session.user.id },
      select: { accountId: true }
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'No account found for user' },
        { status: 404 }
      );
    }

    const accountId = membership.accountId;

    // 3. Parse request body
    const body = await request.json();
    const {
      squadTemplateId,
      assistantTemplateId,
      areaCode,
      phoneNumber: existingPhoneNumber,
      friendlyName,
      customConfig,
    } = body;

    // Validate: Must have either squad OR assistant (not both, not neither)
    if (!squadTemplateId && !assistantTemplateId) {
      return NextResponse.json(
        { success: false, message: 'Must specify squadTemplateId or assistantTemplateId' },
        { status: 400 }
      );
    }

    if (squadTemplateId && assistantTemplateId) {
      return NextResponse.json(
        { success: false, message: 'Cannot specify both squadTemplateId and assistantTemplateId' },
        { status: 400 }
      );
    }

    logger.info({
      accountId,
      squadTemplateId,
      assistantTemplateId,
    }, '[Vapi Phone] Setting up phone number for account');

    // 4. Verify template exists
    let template: VapiSquadTemplate | VapiAssistantTemplate | null = null;
    let templateType: 'squad' | 'assistant';

    if (squadTemplateId) {
      template = await prisma.vapiSquadTemplate.findFirst({
        where: {
          id: squadTemplateId,
          status: 'active'
        }
      });
      
      templateType = 'squad';

      if (!template) {
        return NextResponse.json(
          { success: false, message: 'Squad template not found or inactive' },
          { status: 404 }
        );
      }
    } else {
      template = await prisma.vapiAssistantTemplate.findFirst({
        where: {
          id: assistantTemplateId,
          status: 'active'
        }
      });
      
      templateType = 'assistant';

      if (!template) {
        return NextResponse.json(
          { success: false, message: 'Assistant template not found or inactive' },
          { status: 404 }
        );
      }
    }

    const vapiService = createVapiService();
    const twilioService = createTwilioService();

    if (!vapiService.isEnabled()) {
      return NextResponse.json(
        { success: false, message: 'Vapi integration not configured' },
        { status: 500 }
      );
    }

    // 5. PURCHASE OR USE EXISTING PHONE NUMBER
    let phoneNumber = existingPhoneNumber;
    let twilioPhoneSid: string | undefined;
    let twilioAccountSid: string | undefined;

    if (!phoneNumber && twilioService.isEnabled()) {
      logger.info({ areaCode }, '[Vapi Phone] Purchasing Twilio number');

      // Search for available numbers
      const availableNumbers = await twilioService.searchAvailableNumbers(
        'US',
        'Local',
        { areaCode, smsEnabled: true, voiceEnabled: true, limit: 1 }
      );

      if (availableNumbers.length === 0) {
        return NextResponse.json(
          { success: false, message: 'No available phone numbers found' },
          { status: 500 }
        );
      }

      // Purchase number
      const purchased = await twilioService.purchaseNumber({
        phoneNumber: availableNumbers[0].phoneNumber,
        friendlyName: friendlyName || `${template.display_name} - ${accountId}`,
      });

      if (!purchased) {
        return NextResponse.json(
          { success: false, message: 'Failed to purchase phone number' },
          { status: 500 }
        );
      }

      phoneNumber = purchased.phoneNumber;
      twilioPhoneSid = purchased.sid;
      twilioAccountSid = purchased.accountSid;
    }

    if (!phoneNumber) {
      return NextResponse.json(
        { success: false, message: 'Phone number required' },
        { status: 400 }
      );
    }

    // 6. GET ACCOUNT KNOWLEDGE BASE (if exists)
    const knowledgeFiles = await prisma.vapiAccountKnowledge.findMany({
      where: {
        accountId,
        isProcessed: true
      },
      select: {
        vapiFileId: true
      }
    });

    const knowledgeFileIds = knowledgeFiles
      .map(k => k.vapiFileId)
      .filter(Boolean) as string[];

    // 7. LINK PHONE TO VAPI (Squad or Assistant)
    const twilioAccountSidToUse = twilioAccountSid || process.env.TWILIO_ACCOUNT_SID || '';
    const twilioAuthToken = process.env.TWILIO_AUTH_TOKEN || '';

    let vapiPhoneId: string;

    if (templateType === 'squad') {
      // Get or create the squad in Vapi
      let vapiSquadId = (template as VapiSquadTemplate).vapi_squad_id;

      if (!vapiSquadId) {
        // Create squad in Vapi (only once)
        logger.info({ templateId: template.id }, '[Vapi Phone] Creating squad in Vapi');
        
        const squad = await vapiService.createSquad({
          name: template.name,
          members: [], // TODO: Build from template config
        });

        if (!squad) {
          throw new Error('Failed to create squad in Vapi');
        }

        vapiSquadId = squad.id;

        // Save squad ID to database
        await prisma.vapiSquadTemplate.update({
          where: { id: template.id },
          data: { vapiSquadId }
        });
      }

      // Import phone to Vapi and link to squad
      const vapiPhone = await vapiService.importPhoneNumber(
        phoneNumber,
        twilioAccountSidToUse,
        twilioAuthToken,
        vapiSquadId,
        true  // isSquad = true
      );

      if (!vapiPhone) {
        throw new Error('Failed to import phone to Vapi');
      }

      vapiPhoneId = vapiPhone.id;

    } else {
      // Assistant mode
      let vapiAssistantId = (template as VapiAssistantTemplate).vapi_assistant_id;

      if (!vapiAssistantId) {
        // Create assistant in Vapi (only once)
        logger.info({ templateId: template.id }, '[Vapi Phone] Creating assistant in Vapi');

        const assistantTemplate = template as VapiAssistantTemplate;
        const assistant = await vapiService.createAssistant({
          name: assistantTemplate.name,
          voice: {
            provider: assistantTemplate.voice_provider as any,
            voiceId: assistantTemplate.voice_id,
          },
          model: {
            provider: assistantTemplate.model_provider as any,
            model: assistantTemplate.model_name,
            systemPrompt: assistantTemplate.system_prompt,
          },
          firstMessage: assistantTemplate.first_message || undefined,
        });

        if (!assistant) {
          throw new Error('Failed to create assistant in Vapi');
        }

        vapiAssistantId = assistant.id;

        // Save assistant ID to database
        await prisma.vapiAssistantTemplate.update({
          where: { id: template.id },
          data: { vapiAssistantId }
        });
      }

      // Import phone to Vapi and link to assistant
      const vapiPhone = await vapiService.importPhoneNumber(
        phoneNumber,
        twilioAccountSidToUse,
        twilioAuthToken,
        vapiAssistantId
      );

      if (!vapiPhone) {
        throw new Error('Failed to import phone to Vapi');
      }

      vapiPhoneId = vapiPhone.id;
    }

    // 8. SAVE TO DATABASE
    const savedPhone = await prisma.vapiPhoneNumber.create({
      data: {
        accountId,
        phoneNumber,
        friendlyName: friendlyName || template.displayName,
        areaCode,
        countryCode: 'US',
        twilioPhoneSid: twilioPhoneSid || null,
        twilioAccountSid: twilioAccountSidToUse,
        vapiPhoneId,
        squadTemplateId: squadTemplateId || null,
        assistantTemplateId: assistantTemplateId || null,
        useAccountKnowledge: true,
        customConfig: customConfig || null,
        status: 'active',
        activatedAt: new Date(),
      }
    });

    logger.info({
      phoneNumberId: savedPhone.id,
      phoneNumber,
      accountId,
    }, '[Vapi Phone] Phone number setup complete');

    return NextResponse.json({
      success: true,
      phoneNumber: {
        id: savedPhone.id,
        phoneNumber: savedPhone.phoneNumber,
        friendlyName: savedPhone.friendlyName,
        status: savedPhone.status,
        templateType: templateType,
        templateName: template.displayName,
      },
      message: 'Phone number setup successfully',
    });

  } catch (error) {
    logger.error({
      error: error instanceof Error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : error,
    }, '[Vapi Phone] Exception during setup');

    return NextResponse.json(
      { success: false, message: 'Failed to setup phone number' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/vapi/phone-numbers
 * 
 * List all phone numbers for the current user's account
 * 
 * Authentication: Required
 */
export async function GET(request: Request) {
  const logger = await getLogger();

  try {
    // Authentication
    const session = await requireSession();
    
    if (!session?.user?.id) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's account
    const membership = await prisma.accountMembership.findFirst({
      where: { userId: session.user.id },
      select: { accountId: true }
    });

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'No account found' },
        { status: 404 }
      );
    }

    // Get all phone numbers for account
    const phoneNumbers = await prisma.vapiPhoneNumber.findMany({
      where: { accountId: membership.accountId },
      include: {
        squadTemplate: true,
        assistantTemplate: true
      },
      orderBy: { createdAt: 'desc' }
    });

    return NextResponse.json({
      success: true,
      phoneNumbers: phoneNumbers || [],
    });

  } catch (error) {
    logger.error({ error }, '[Vapi Phone] Exception');
    return NextResponse.json(
      { success: false, message: 'Failed to fetch phone numbers' },
      { status: 500 }
    );
  }
}
