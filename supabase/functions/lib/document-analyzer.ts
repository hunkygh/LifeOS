// Document analysis engine for intelligent document organization
// Analyzes ClickUp documents to determine proper placement

export interface DocumentAnalysis {
  documentId: string;
  title: string;
  content: string;
  currentSpaceId: string;
  currentListId: string;
  currentSpaceName: string;
  currentListName: string;
  contentType: DocumentType;
  keywords: string[];
  entities: DocumentEntities;
  recommendedPlacement: PlacementRecommendation;
  confidence: number;
  createdAt: string;
  updatedAt: string;
}

export type DocumentType = 
  | 'meeting_notes'
  | 'project_doc' 
  | 'personal_note'
  | 'financial_doc'
  | 'health_record'
  | 'learning_material'
  | 'client_communication'
  | 'sales_doc'
  | 'admin_doc'
  | 'unknown';

export interface DocumentEntities {
  companies?: string[];
  people?: string[];
  dates?: string[];
  projects?: string[];
  locations?: string[];
  topics?: string[];
}

export interface PlacementRecommendation {
  targetSpaceId: string;
  targetSpaceName: string;
  targetListId: string;
  targetListName: string;
  confidence: number;
  reasoning: string;
  alternativePlacements?: PlacementRecommendation[];
}

export interface DocumentAnalysisConfig {
  workspaceId: string;
  spaces: ClickUpSpace[];
  lists: ClickUpList[];
  analysisDepth: 'basic' | 'deep';
  confidenceThreshold: number;
}

export interface ClickUpSpace {
  id: string;
  name: string;
  domain: string;
  space_type: string;
  is_default: boolean;
  priority_rank: number;
}

export interface ClickUpList {
  id: string;
  name: string;
  space_id: string;
  list_type: string;
  context?: string;
}

export class DocumentAnalyzer {
  private config: DocumentAnalysisConfig;
  private domainPatterns: Map<string, DomainPattern>;

  constructor(config: DocumentAnalysisConfig) {
    this.config = config;
    this.domainPatterns = this.initializeDomainPatterns();
  }

  // Analyze a single document
  async analyzeDocument(document: any): Promise<DocumentAnalysis> {
    const title = document.name || '';
    const content = document.description || document.content || '';
    const fullText = `${title} ${content}`.toLowerCase();

    // Extract content type
    const contentType = this.detectContentType(fullText, title);

    // Extract entities
    const entities = this.extractEntities(fullText);

    // Generate keywords
    const keywords = this.extractKeywords(fullText);

    // Determine recommended placement
    const recommendation = this.generateRecommendation(contentType, entities, keywords);

    // Calculate overall confidence
    const confidence = this.calculateConfidence(contentType, entities, keywords, recommendation);

    return {
      documentId: document.id,
      title,
      content,
      currentSpaceId: document.space?.id || '',
      currentListId: document.list?.id || '',
      currentSpaceName: document.space?.name || 'Unknown',
      currentListName: document.list?.name || 'Unknown',
      contentType,
      keywords,
      entities,
      recommendedPlacement: recommendation,
      confidence,
      createdAt: document.created_at,
      updatedAt: document.updated_at
    };
  }

  // Analyze multiple documents
  async analyzeDocuments(documents: any[]): Promise<DocumentAnalysis[]> {
    const analyses: DocumentAnalysis[] = [];
    
    for (const document of documents) {
      try {
        const analysis = await this.analyzeDocument(document);
        analyses.push(analysis);
      } catch (error) {
        console.error(`Error analyzing document ${document.id}:`, error);
      }
    }

    return analyses.sort((a, b) => b.confidence - a.confidence);
  }

  // Detect document type based on content patterns
  private detectContentType(fullText: string, title: string): DocumentType {
    const text = fullText.toLowerCase();
    const titleLower = title.toLowerCase();

    // Meeting notes patterns
    if (this.matchesAnyPattern(text, [
      'meeting notes', 'meeting with', 'discussion', 'agenda', 'minutes',
      '1:1', 'standup', 'call notes', 'conference call'
    ]) || this.matchesAnyPattern(titleLower, [
      'meeting', 'call', 'discussion', 'standup'
    ])) {
      return 'meeting_notes';
    }

    // Client communication patterns
    if (this.matchesAnyPattern(text, [
      'client', 'customer', 'prospect', 'lead', 'account',
      'sales call', 'client meeting', 'proposal', 'contract'
    ]) || this.matchesAnyPattern(titleLower, [
      'client', 'customer', 'prospect', 'lead'
    ])) {
      return 'client_communication';
    }

    // Financial document patterns
    if (this.matchesAnyPattern(text, [
      'budget', 'invoice', 'payment', 'expense', 'financial',
      'receipt', 'tax', 'profit', 'revenue', 'cost'
    ]) || this.matchesAnyPattern(titleLower, [
      'budget', 'invoice', 'payment', 'expense', 'financial'
    ])) {
      return 'financial_doc';
    }

    // Health record patterns
    if (this.matchesAnyPattern(text, [
      'workout', 'exercise', 'fitness', 'health', 'medical',
      'doctor', 'appointment', 'diet', 'nutrition', 'weight'
    ]) || this.matchesAnyPattern(titleLower, [
      'workout', 'health', 'medical', 'fitness'
    ])) {
      return 'health_record';
    }

    // Learning material patterns
    if (this.matchesAnyPattern(text, [
      'course', 'study', 'learn', 'training', 'tutorial',
      'certification', 'education', 'skill', 'knowledge'
    ]) || this.matchesAnyPattern(titleLower, [
      'course', 'study', 'learn', 'training'
    ])) {
      return 'learning_material';
    }

    // Project document patterns
    if (this.matchesAnyPattern(text, [
      'project', 'milestone', 'deliverable', 'timeline',
      'requirements', 'specification', 'design', 'plan'
    ]) || this.matchesAnyPattern(titleLower, [
      'project', 'milestone', 'deliverable', 'spec'
    ])) {
      return 'project_doc';
    }

    // Sales document patterns
    if (this.matchesAnyPattern(text, [
      'sales', 'deal', 'opportunity', 'pipeline', 'quota',
      'commission', 'target', 'forecast', 'proposal'
    ]) || this.matchesAnyPattern(titleLower, [
      'sales', 'deal', 'opportunity', 'pipeline'
    ])) {
      return 'sales_doc';
    }

    // Admin document patterns
    if (this.matchesAnyPattern(text, [
      'admin', 'administrative', 'procedure', 'policy',
      'process', 'guideline', 'manual', 'template'
    ]) || this.matchesAnyPattern(titleLower, [
      'admin', 'procedure', 'policy', 'process'
    ])) {
      return 'admin_doc';
    }

    // Personal note patterns
    if (this.matchesAnyPattern(text, [
      'personal', 'private', 'reminder', 'note to self',
      'todo', 'shopping', 'grocery', 'errand', 'personal'
    ]) || this.matchesAnyPattern(titleLower, [
      'personal', 'reminder', 'todo', 'shopping'
    ])) {
      return 'personal_note';
    }

    return 'unknown';
  }

  // Extract entities from document text
  private extractEntities(text: string): DocumentEntities {
    const entities: DocumentEntities = {};

    // Extract company names
    entities.companies = this.extractCompanies(text);

    // Extract people names
    entities.people = this.extractPeople(text);

    // Extract dates
    entities.dates = this.extractDates(text);

    // Extract project names
    entities.projects = this.extractProjects(text);

    // Extract locations
    entities.locations = this.extractLocations(text);

    // Extract topics
    entities.topics = this.extractTopics(text);

    return entities;
  }

  // Extract keywords from document
  private extractKeywords(text: string): string[] {
    const words = text.toLowerCase().split(/\s+/);
    const stopWords = new Set([
      'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
      'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
      'before', 'after', 'above', 'below', 'between', 'among', 'is', 'are',
      'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do',
      'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might',
      'must', 'can', 'shall', 'this', 'that', 'these', 'those', 'i', 'you',
      'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who', 'when',
      'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more',
      'most', 'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own',
      'same', 'so', 'than', 'too', 'very', 'just', 'now'
    ]);

    const keywords = words
      .filter(word => word.length > 2 && !stopWords.has(word))
      .filter(word => !/^\d+$/.test(word)) // Remove pure numbers
      .filter(word => !/^[^\w]+$/.test(word)) // Remove special characters only
      .map(word => word.replace(/[^\w]/g, '')) // Clean up words
      .filter(word => word.length > 2);

    // Count frequency and return top keywords
    const frequency = new Map<string, number>();
    keywords.forEach(word => {
      frequency.set(word, (frequency.get(word) || 0) + 1);
    });

    return Array.from(frequency.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([word]) => word);
  }

  // Generate placement recommendation
  private generateRecommendation(
    contentType: DocumentType,
    entities: DocumentEntities,
    keywords: string[]
  ): PlacementRecommendation {
    const domain = this.determineDomain(contentType, entities, keywords);
    const space = this.findBestSpace(domain, entities, keywords);
    const list = this.findBestList(space, contentType, entities, keywords);

    const reasoning = this.generateReasoning(contentType, domain, space, list, entities);

    return {
      targetSpaceId: space.id,
      targetSpaceName: space.name,
      targetListId: list.id,
      targetListName: list.name,
      confidence: this.calculatePlacementConfidence(contentType, domain, space, list, entities),
      reasoning
    };
  }

  // Determine domain based on content and entities
  private determineDomain(
    contentType: DocumentType,
    entities: DocumentEntities,
    keywords: string[]
  ): string {
    // Business/work domain indicators
    if (contentType === 'client_communication' || 
        contentType === 'sales_doc' || 
        contentType === 'project_doc') {
      return 'work';
    }

    // Health domain indicators
    if (contentType === 'health_record') {
      return 'health';
    }

    // Finance domain indicators
    if (contentType === 'financial_doc') {
      return 'finance';
    }

    // Learning domain indicators
    if (contentType === 'learning_material') {
      return 'learning';
    }

    // Check entity-based domain detection
    if (entities.companies && entities.companies.length > 0) {
      return 'work';
    }

    if (entities.projects && entities.projects.length > 0) {
      return 'work';
    }

    // Keyword-based domain detection
    const workKeywords = ['meeting', 'project', 'client', 'business', 'work', 'office'];
    const healthKeywords = ['workout', 'health', 'fitness', 'medical', 'doctor'];
    const financeKeywords = ['budget', 'financial', 'money', 'payment', 'expense'];
    const learningKeywords = ['course', 'study', 'learn', 'training', 'education'];

    if (keywords.some(k => workKeywords.includes(k))) return 'work';
    if (keywords.some(k => healthKeywords.includes(k))) return 'health';
    if (keywords.some(k => financeKeywords.includes(k))) return 'finance';
    if (keywords.some(k => learningKeywords.includes(k))) return 'learning';

    return 'personal';
  }

  // Find best space for domain
  private findBestSpace(domain: string, entities: DocumentEntities, keywords: string[]): ClickUpSpace {
    const domainSpaces = this.config.spaces.filter(space => space.domain === domain);
    
    if (domainSpaces.length === 0) {
      // Fallback to default space
      return this.config.spaces.find(space => space.is_default) || this.config.spaces[0];
    }

    // Prefer default space for domain
    const defaultSpace = domainSpaces.find(space => space.is_default);
    if (defaultSpace) return defaultSpace;

    // Fall back to highest priority space
    return domainSpaces.sort((a, b) => a.priority_rank - b.priority_rank)[0];
  }

  // Find best list within space
  private findBestList(
    space: ClickUpSpace,
    contentType: DocumentType,
    entities: DocumentEntities,
    keywords: string[]
  ): ClickUpList {
    const spaceLists = this.config.lists.filter(list => list.space_id === space.id);
    
    if (spaceLists.length === 0) {
      // Create a default list object
      return {
        id: 'default',
        name: 'General',
        space_id: space.id,
        list_type: 'general'
      };
    }

    // Content type to list type mapping
    const listTypeMapping: Record<DocumentType, string> = {
      meeting_notes: 'events',
      project_doc: 'projects',
      personal_note: 'tasks',
      financial_doc: 'financial',
      health_record: 'health',
      learning_material: 'learning',
      client_communication: 'communications',
      sales_doc: 'sales',
      admin_doc: 'admin',
      unknown: 'general'
    };

    const targetListType = listTypeMapping[contentType];
    const matchingList = spaceLists.find(list => list.list_type === targetListType);
    
    if (matchingList) return matchingList;

    // Fall back to general list
    const generalList = spaceLists.find(list => list.list_type === 'general');
    if (generalList) return generalList;

    // Return first available list
    return spaceLists[0];
  }

  // Calculate confidence score
  private calculateConfidence(
    contentType: DocumentType,
    entities: DocumentEntities,
    keywords: string[],
    recommendation: PlacementRecommendation
  ): number {
    let confidence = 0.5; // Base confidence

    // Content type confidence
    if (contentType !== 'unknown') confidence += 0.2;

    // Entity confidence
    const entityCount = Object.values(entities).filter(arr => arr && arr.length > 0).length;
    confidence += (entityCount / 6) * 0.2; // Max 0.2 for entities

    // Keyword confidence
    const relevantKeywords = keywords.filter(k => k.length > 4).length;
    confidence += Math.min(relevantKeywords / 10, 0.1);

    // Placement confidence
    confidence += recommendation.confidence * 0.2;

    return Math.min(confidence, 1.0);
  }

  // Calculate placement confidence
  private calculatePlacementConfidence(
    contentType: DocumentType,
    domain: string,
    space: ClickUpSpace,
    list: ClickUpList,
    entities: DocumentEntities
  ): number {
    let confidence = 0.6; // Base confidence

    // Domain-space match
    if (space.domain === domain) confidence += 0.2;

    // Content type-list match
    if (this.isGoodListMatch(contentType, list.list_type)) confidence += 0.1;

    // Entity support
    if (entities.companies && space.domain === 'work') confidence += 0.05;
    if (entities.projects && space.domain === 'work') confidence += 0.05;

    return Math.min(confidence, 1.0);
  }

  // Helper methods
  private matchesAnyPattern(text: string, patterns: string[]): boolean {
    return patterns.some(pattern => text.includes(pattern));
  }

  private isGoodListMatch(contentType: DocumentType, listType: string): boolean {
    const matches: Record<DocumentType, string[]> = {
      meeting_notes: ['events', 'meetings', 'communications'],
      project_doc: ['projects', 'tasks'],
      personal_note: ['tasks', 'personal'],
      financial_doc: ['financial', 'admin'],
      health_record: ['health', 'personal'],
      learning_material: ['learning', 'personal'],
      client_communication: ['communications', 'sales', 'events'],
      sales_doc: ['sales', 'opportunities'],
      admin_doc: ['admin', 'general'],
      unknown: ['general']
    };

    return matches[contentType]?.includes(listType) || false;
  }

  private generateReasoning(
    contentType: DocumentType,
    domain: string,
    space: ClickUpSpace,
    list: ClickUpList,
    entities: DocumentEntities
  ): string {
    const reasons = [];

    reasons.push(`Document identified as ${contentType.replace('_', ' ')}`);
    reasons.push(`Best fit for ${domain} domain`);
    reasons.push(`Recommended space: ${space.name}`);
    reasons.push(`Target list: ${list.name}`);

    if (entities.companies?.length) {
      reasons.push(`Contains company references: ${entities.companies.join(', ')}`);
    }

    if (entities.people?.length) {
      reasons.push(`Mentions people: ${entities.people.slice(0, 3).join(', ')}`);
    }

    return reasons.join('. ');
  }

  // Entity extraction methods (simplified versions)
  private extractCompanies(text: string): string[] {
    const companyPatterns = [
      /\b(acme corp|google|microsoft|apple|amazon|tesla|facebook|netflix|twitter|instagram)\b/gi,
      /\b([A-Z][a-z]+ [A-Z][a-z]+(?:\s+(?:Inc|Corp|LLC|Ltd))?)\b/g
    ];

    const companies = new Set<string>();
    companyPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) matches.forEach(m => companies.add(m));
    });

    return Array.from(companies);
  }

  private extractPeople(text: string): string[] {
    const peoplePatterns = [
      /\b([A-Z][a-z]+ [A-Z][a-z]+)\b/g,
      /\b(john|jane|bob|alice|charlie|david|emma|frank|grace|henry)\b/gi
    ];

    const people = new Set<string>();
    peoplePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) matches.forEach(m => people.add(m));
    });

    return Array.from(people);
  }

  private extractDates(text: string): string[] {
    const datePatterns = [
      /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}(?:\s+\d{4})?\b/gi,
      /\b(\d{1,2}\/\d{1,2}\/\d{2,4})\b/g,
      /\b(today|tomorrow|yesterday|next week|last week)\b/gi
    ];

    const dates = new Set<string>();
    datePatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) matches.forEach(m => dates.add(m));
    });

    return Array.from(dates);
  }

  private extractProjects(text: string): string[] {
    const projectPatterns = [
      /\b(project\s+[A-Z][a-z]+)\b/gi,
      /\b([A-Z][a-z]+\s+Project)\b/g
    ];

    const projects = new Set<string>();
    projectPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) matches.forEach(m => projects.add(m));
    });

    return Array.from(projects);
  }

  private extractLocations(text: string): string[] {
    const locationPatterns = [
      /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*),\s+[A-Z]{2}\b/g,
      /\b(office|home|downtown|uptown|airport|hotel|restaurant)\b/gi
    ];

    const locations = new Set<string>();
    locationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) matches.forEach(m => locations.add(m));
    });

    return Array.from(locations);
  }

  private extractTopics(text: string): string[] {
    const topicKeywords = [
      'marketing', 'sales', 'development', 'design', 'finance', 'hr',
      'strategy', 'planning', 'research', 'analysis', 'report', 'presentation'
    ];

    return topicKeywords.filter(topic => text.includes(topic));
  }

  private initializeDomainPatterns(): Map<string, DomainPattern> {
    const patterns = new Map<string, DomainPattern>();
    
    // Initialize domain patterns (simplified for now)
    patterns.set('work', {
      keywords: ['meeting', 'project', 'client', 'business', 'work'],
      listTypes: ['events', 'projects', 'tasks', 'communications'],
      confidence: 0.8
    });

    patterns.set('health', {
      keywords: ['workout', 'health', 'fitness', 'medical'],
      listTypes: ['health', 'personal'],
      confidence: 0.8
    });

    patterns.set('finance', {
      keywords: ['budget', 'financial', 'money', 'payment'],
      listTypes: ['financial', 'admin'],
      confidence: 0.8
    });

    patterns.set('learning', {
      keywords: ['course', 'study', 'learn', 'training'],
      listTypes: ['learning', 'personal'],
      confidence: 0.8
    });

    patterns.set('personal', {
      keywords: ['personal', 'reminder', 'todo', 'shopping'],
      listTypes: ['personal', 'tasks'],
      confidence: 0.6
    });

    return patterns;
  }
}

interface DomainPattern {
  keywords: string[];
  listTypes: string[];
  confidence: number;
}
