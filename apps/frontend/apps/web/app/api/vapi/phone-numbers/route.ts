import { NextResponse } from 'next/server';
import { createVapiService } from '@kit/shared/vapi/server';
import { createTwilioService } from '@kit/shared/twilio/server';
import { getLogger } from '@kit/shared/logger';
import { getSupabaseRouteHandlerClient } from '@kit/supabase/route-handler-client';
import { Database } from '@kit/supabase/database';

type VapiPhoneNumber = Database['public']['Tables']['vapi_phone_numbers']['Row'];
type VapiSquadTemplate = Database['public']['Tables']['vapi_squad_templates']['Row'];
type VapiAssistantTemplate = Database['public']['Tables']['vapi_assistant_templates']['Row'];

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
  const supabase = getSupabaseRouteHandlerClient();

  try {
    // 1. AUTHENTICATION: Get current user
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // 2. Get user's account
    const { data: membership } = await supabase
      .from('accounts_memberships')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'No account found for user' },
        { status: 404 }
      );
    }

    const accountId = membership.account_id;

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
      const { data } = await supabase
        .from('vapi_squad_templates')
        .select('*')
        .eq('id', squadTemplateId)
        .eq('status', 'active')
        .single();
      
      template = data;
      templateType = 'squad';

      if (!template) {
        return NextResponse.json(
          { success: false, message: 'Squad template not found or inactive' },
          { status: 404 }
        );
      }
    } else {
      const { data } = await supabase
        .from('vapi_assistant_templates')
        .select('*')
        .eq('id', assistantTemplateId)
        .eq('status', 'active')
        .single();
      
      template = data;
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
    const { data: knowledgeFiles } = await supabase
      .from('vapi_account_knowledge')
      .select('vapi_file_id')
      .eq('account_id', accountId)
      .eq('is_processed', true);

    const knowledgeFileIds = knowledgeFiles
      ?.map(k => k.vapi_file_id)
      .filter(Boolean) as string[] || [];

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
        await supabase
          .from('vapi_squad_templates')
          .update({ vapi_squad_id: vapiSquadId })
          .eq('id', template.id);
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
        await supabase
          .from('vapi_assistant_templates')
          .update({ vapi_assistant_id: vapiAssistantId })
          .eq('id', template.id);
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
    const { data: savedPhone, error: dbError } = await supabase
      .from('vapi_phone_numbers')
      .insert({
        account_id: accountId,
        phone_number: phoneNumber,
        friendly_name: friendlyName || template.display_name,
        area_code: areaCode,
        country_code: 'US',
        twilio_phone_sid: twilioPhoneSid,
        twilio_account_sid: twilioAccountSidToUse,
        vapi_phone_id: vapiPhoneId,
        squad_template_id: squadTemplateId || null,
        assistant_template_id: assistantTemplateId || null,
        use_account_knowledge: true,
        custom_config: customConfig || null,
        status: 'active',
        activated_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (dbError) {
      logger.error({ error: dbError }, '[Vapi Phone] Failed to save to database');
      throw new Error('Failed to save phone number to database');
    }

    logger.info({
      phoneNumberId: savedPhone.id,
      phoneNumber,
      accountId,
    }, '[Vapi Phone] Phone number setup complete');

    return NextResponse.json({
      success: true,
      phoneNumber: {
        id: savedPhone.id,
        phoneNumber: savedPhone.phone_number,
        friendlyName: savedPhone.friendly_name,
        status: savedPhone.status,
        templateType: templateType,
        templateName: template.display_name,
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
  const supabase = getSupabaseRouteHandlerClient();

  try {
    // Authentication
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json(
        { success: false, message: 'Unauthorized' },
        { status: 401 }
      );
    }

    // Get user's account
    const { data: membership } = await supabase
      .from('accounts_memberships')
      .select('account_id')
      .eq('user_id', user.id)
      .single();

    if (!membership) {
      return NextResponse.json(
        { success: false, message: 'No account found' },
        { status: 404 }
      );
    }

    // Get all phone numbers for account
    const { data: phoneNumbers, error } = await supabase
      .from('vapi_phone_numbers')
      .select(`
        *,
        squad_template:vapi_squad_templates(*),
        assistant_template:vapi_assistant_templates(*)
      `)
      .eq('account_id', membership.account_id)
      .order('created_at', { ascending: false });

    if (error) {
      logger.error({ error }, '[Vapi Phone] Failed to fetch phone numbers');
      throw error;
    }

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
