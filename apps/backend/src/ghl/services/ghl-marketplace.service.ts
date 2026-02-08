import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

/**
 * Marketplace Agent Interface
 */
export interface MarketplaceAgent {
  id: string;
  name: string;
  description: string;
  category: string;
  rating: number;
  installs: number;
  author: string;
  features: string[];
  previewImage?: string;
  tags: string[];
  voiceId?: string;
  includesWorkflows: boolean;
  includesActions: boolean;
  includedCustomObjects: string[];
}

/**
 * Installed Agent Configuration
 */
export interface InstalledAgentConfig {
  marketplaceAgentId: string;
  name?: string; // Override default name
  voiceId?: string; // Override default voice
  phoneNumber?: string;
  customizations?: {
    prompt?: string;
    greetingMessage?: string;
    workflows?: Record<string, any>;
    actions?: Record<string, any>[];
    customObjects?: Record<string, any>[];
  };
}

interface GhlMarketplaceResponse {
  agents?: MarketplaceAgent[];
  agent?: any;
  error?: string;
  message?: string;
}

@Injectable()
export class GhlMarketplaceService {
  private readonly logger = new Logger(GhlMarketplaceService.name);
  private readonly ghlApiKey: string;
  private readonly ghlBaseUrl: string;

  // Mock marketplace agents for development
  private readonly MOCK_MARKETPLACE_AGENTS: MarketplaceAgent[] = [
    {
      id: 'appointment-booker-pro',
      name: 'Appointment Booker Pro',
      description:
        'Professional appointment booking agent with calendar integration, SMS reminders, and automated follow-ups. Perfect for dental offices, medical practices, and service businesses.',
      category: 'Healthcare',
      rating: 4.8,
      installs: 1247,
      author: 'GHL Official',
      features: [
        'Smart calendar availability checking',
        'Automated SMS reminders',
        'Multi-location support',
        'Insurance verification integration',
        'Cancellation and rescheduling',
        'Waitlist management',
      ],
      tags: ['appointments', 'healthcare', 'calendar', 'reminders'],
      voiceId: 'nova', // Default female voice
      includesWorkflows: true,
      includesActions: true,
      includedCustomObjects: ['Appointment', 'Patient', 'Availability'],
    },
    {
      id: 'lead-qualifier-ai',
      name: 'Lead Qualifier AI',
      description:
        'Intelligent lead qualification agent that asks the right questions, scores leads, and routes hot prospects to your sales team immediately.',
      category: 'Sales',
      rating: 4.9,
      installs: 2156,
      author: 'GHL Official',
      features: [
        'Dynamic question branching',
        'Lead scoring algorithm',
        'CRM auto-update',
        'Hot lead SMS alerts',
        'Budget qualification',
        'Timeline assessment',
      ],
      tags: ['sales', 'lead-gen', 'qualification', 'crm'],
      voiceId: 'alloy', // Professional male voice
      includesWorkflows: true,
      includesActions: true,
      includedCustomObjects: ['Lead', 'QualificationCriteria', 'LeadScore'],
    },
    {
      id: 'customer-support-assistant',
      name: 'Customer Support Assistant',
      description:
        'Comprehensive customer support agent that handles FAQs, troubleshooting, ticket creation, and escalation to human agents when needed.',
      category: 'Support',
      rating: 4.7,
      installs: 3421,
      author: 'GHL Official',
      features: [
        'Knowledge base integration',
        'Ticket creation and tracking',
        'Smart escalation rules',
        'Multi-language support',
        'Sentiment analysis',
        'Post-call surveys',
      ],
      tags: ['support', 'helpdesk', 'tickets', 'customer-service'],
      voiceId: 'shimmer', // Empathetic female voice
      includesWorkflows: true,
      includesActions: true,
      includedCustomObjects: ['Ticket', 'FAQ', 'EscalationRule'],
    },
    {
      id: 'real-estate-inquiry-handler',
      name: 'Real Estate Inquiry Handler',
      description:
        'Specialized agent for real estate professionals. Handles property inquiries, schedules showings, qualifies buyers, and provides market information.',
      category: 'Real Estate',
      rating: 4.6,
      installs: 891,
      author: 'Real Estate Pro Tools',
      features: [
        'Property database integration',
        'Showing schedule automation',
        'Buyer pre-qualification',
        'Virtual tour scheduling',
        'Mortgage pre-approval routing',
        'Market stats delivery',
      ],
      tags: ['real-estate', 'property', 'showings', 'buyers'],
      voiceId: 'echo', // Warm male voice
      includesWorkflows: true,
      includesActions: true,
      includedCustomObjects: ['Property', 'Showing', 'BuyerProfile'],
    },
    {
      id: 'restaurant-reservation-agent',
      name: 'Restaurant Reservation Agent',
      description:
        'Complete restaurant reservation system with table management, dietary restrictions handling, special requests, and automated confirmations.',
      category: 'Hospitality',
      rating: 4.8,
      installs: 1543,
      author: 'Hospitality Tech',
      features: [
        'Real-time table availability',
        'Dietary restrictions tracking',
        'Special occasion handling',
        'Party size management',
        'Reservation reminders',
        'Cancellation notifications',
      ],
      tags: ['restaurant', 'reservations', 'hospitality', 'dining'],
      voiceId: 'nova', // Friendly female voice
      includesWorkflows: true,
      includesActions: true,
      includedCustomObjects: ['Reservation', 'Table', 'DietaryRestriction'],
    },
  ];

  constructor(private readonly configService: ConfigService) {
    this.ghlApiKey = this.configService.get<string>('GHL_API_KEY') || '';
    this.ghlBaseUrl =
      this.configService.get<string>('GHL_BASE_URL') ||
      'https://services.leadconnectorhq.com';
  }

  /**
   * Browse marketplace agents
   */
  async browseMarketplace(filters?: {
    category?: string;
    search?: string;
    minRating?: number;
  }): Promise<MarketplaceAgent[]> {
    try {
      this.logger.log('Browsing marketplace agents');

      // Try to fetch from GHL API first
      const ghlAgents = await this.fetchMarketplaceAgentsFromGhl();

      let agents = ghlAgents && ghlAgents.length > 0 ? ghlAgents : this.MOCK_MARKETPLACE_AGENTS;

      // Apply filters
      if (filters?.category) {
        agents = agents.filter((a) => a.category === filters.category);
      }

      if (filters?.search) {
        const searchLower = filters.search.toLowerCase();
        agents = agents.filter(
          (a) =>
            a.name.toLowerCase().includes(searchLower) ||
            a.description.toLowerCase().includes(searchLower) ||
            a.tags.some((t) => t.toLowerCase().includes(searchLower)),
        );
      }

      if (filters?.minRating !== undefined) {
        agents = agents.filter((a) => a.rating >= filters.minRating!);
      }

      return agents;
    } catch (error) {
      this.logger.error({
        message: 'Error browsing marketplace',
        error: error.message,
      });
      return this.MOCK_MARKETPLACE_AGENTS;
    }
  }

  /**
   * Get marketplace agent details
   */
  async getMarketplaceAgent(agentId: string): Promise<MarketplaceAgent | null> {
    try {
      const agents = await this.browseMarketplace();
      return agents.find((a) => a.id === agentId) || null;
    } catch (error) {
      this.logger.error({
        message: 'Error getting marketplace agent',
        error: error.message,
      });
      return null;
    }
  }

  /**
   * Install marketplace agent to a location
   * This clones the agent configuration and creates it in the user's GHL location
   */
  async installMarketplaceAgent(
    locationId: string,
    config: InstalledAgentConfig,
  ): Promise<any> {
    try {
      this.logger.log({
        message: 'Installing marketplace agent',
        locationId,
        agentId: config.marketplaceAgentId,
      });

      // Get marketplace agent template
      const marketplaceAgent = await this.getMarketplaceAgent(config.marketplaceAgentId);

      if (!marketplaceAgent) {
        throw new Error('Marketplace agent not found');
      }

      // Build installation payload
      const payload = {
        locationId,
        marketplaceAgentId: config.marketplaceAgentId,
        name: config.name || marketplaceAgent.name,
        voiceId: config.voiceId || marketplaceAgent.voiceId,
        phoneNumber: config.phoneNumber,
        customizations: config.customizations,
      };

      // Try GHL API
      const response = await fetch(`${this.ghlBaseUrl}/marketplace/agents/install`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.ghlApiKey}`,
          'Content-Type': 'application/json',
          Version: '2021-07-28',
        },
        body: JSON.stringify(payload),
      });

      if (response.ok) {
        const result = await response.json();
        this.logger.log({
          message: 'Agent installed from marketplace',
          agentId: result.agent?.id,
        });
        return result.agent;
      }

      // Mock response for development
      this.logger.warn('GHL marketplace API not available, returning mock installation');
      return {
        id: `installed-${Date.now()}`,
        ...payload,
        installedAt: new Date().toISOString(),
        workflows: marketplaceAgent.includesWorkflows ? this.getMockWorkflows(config.marketplaceAgentId) : [],
        actions: marketplaceAgent.includesActions ? this.getMockActions(config.marketplaceAgentId) : [],
        customObjects: marketplaceAgent.includedCustomObjects,
      };
    } catch (error) {
      this.logger.error({
        message: 'Error installing marketplace agent',
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get categories from marketplace
   */
  async getMarketplaceCategories(): Promise<string[]> {
    const agents = await this.browseMarketplace();
    return Array.from(new Set(agents.map((a) => a.category)));
  }

  /**
   * Fetch marketplace agents from GHL API
   */
  private async fetchMarketplaceAgentsFromGhl(): Promise<MarketplaceAgent[] | null> {
    try {
      if (!this.ghlApiKey) {
        return null;
      }

      const response = await fetch(`${this.ghlBaseUrl}/marketplace/agents`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${this.ghlApiKey}`,
          Version: '2021-07-28',
        },
      });

      if (!response.ok) {
        return null;
      }

      const result = (await response.json()) as GhlMarketplaceResponse;
      return result.agents || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Get mock workflows for marketplace agent
   */
  private getMockWorkflows(agentId: string): any[] {
    const workflowsByAgent: Record<string, any[]> = {
      'appointment-booker-pro': [
        {
          id: 'check-availability',
          name: 'Check Calendar Availability',
          trigger: 'appointment_request',
          actions: ['query_calendar', 'offer_times', 'confirm_booking'],
        },
        {
          id: 'send-reminder',
          name: 'Send Appointment Reminder',
          trigger: '24_hours_before',
          actions: ['send_sms', 'send_email'],
        },
      ],
      'lead-qualifier-ai': [
        {
          id: 'qualify-lead',
          name: 'Lead Qualification Flow',
          trigger: 'new_call',
          actions: ['ask_budget', 'ask_timeline', 'calculate_score', 'route_lead'],
        },
      ],
    };

    return workflowsByAgent[agentId] || [];
  }

  /**
   * Get mock actions for marketplace agent
   */
  private getMockActions(agentId: string): any[] {
    const actionsByAgent: Record<string, any[]> = {
      'appointment-booker-pro': [
        { id: 'query_calendar', name: 'Query Calendar', type: 'api_call' },
        { id: 'send_sms', name: 'Send SMS Reminder', type: 'notification' },
        { id: 'update_crm', name: 'Update CRM Contact', type: 'crm_action' },
      ],
      'lead-qualifier-ai': [
        { id: 'calculate_score', name: 'Calculate Lead Score', type: 'computation' },
        { id: 'route_lead', name: 'Route to Sales Rep', type: 'routing' },
        { id: 'send_alert', name: 'Send Hot Lead Alert', type: 'notification' },
      ],
    };

    return actionsByAgent[agentId] || [];
  }
}
