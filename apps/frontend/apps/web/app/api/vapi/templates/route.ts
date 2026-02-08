import { NextResponse } from 'next/server';
import { getSupabaseRouteHandlerClient } from '@kit/supabase/route-handler-client';
import { getLogger } from '@kit/shared/logger';

/**
 * GET /api/vapi/templates
 * 
 * List all available squad and assistant templates
 * 
 * Authentication: Required
 * 
 * Response:
 * {
 *   success: true,
 *   squads: [...],
 *   assistants: [...]
 * }
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

    // Get active squad templates
    const { data: squads, error: squadsError } = await supabase
      .from('vapi_squad_templates')
      .select('*')
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('display_name');

    if (squadsError) {
      logger.error({ error: squadsError }, '[Vapi Templates] Failed to fetch squads');
      throw squadsError;
    }

    // Get active assistant templates
    const { data: assistants, error: assistantsError } = await supabase
      .from('vapi_assistant_templates')
      .select('*')
      .eq('status', 'active')
      .order('is_default', { ascending: false })
      .order('display_name');

    if (assistantsError) {
      logger.error({ error: assistantsError }, '[Vapi Templates] Failed to fetch assistants');
      throw assistantsError;
    }

    return NextResponse.json({
      success: true,
      squads: squads || [],
      assistants: assistants || [],
    });

  } catch (error) {
    logger.error({ error }, '[Vapi Templates] Exception');
    return NextResponse.json(
      { success: false, message: 'Failed to fetch templates' },
      { status: 500 }
    );
  }
}
