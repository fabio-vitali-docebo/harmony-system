import { injectable } from 'tsyringe';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

export interface ProcessedContent {
  id: string;
  type: string;
  title: string;
  content: string;
  sections: ContentSection[];
  images: string[];
  tables: any[];
  citations: string[];
  metadata: ContentMetadata;
}

export interface ContentSection {
  heading: string;
  content: string;
  level: number;
}

export interface ContentMetadata {
  wordCount: number;
  language: string;
  extractedAt: Date;
  source: string;
  author?: string;
  publishedDate?: Date;
}

export interface ProcessingOptions {
  maxContentLength?: number;
  includeImages?: boolean;
  includeTables?: boolean;
  extractSections?: boolean;
}

@injectable()
export class InputProcessor {
  private s3Client: S3Client;

  constructor() {
    this.s3Client = new S3Client({ region: process.env.AWS_REGION });
  }

  async processMultipleInputs(
    inputs: Array<{ type: string; source: string; priority?: number }>,
    options: ProcessingOptions = {}
  ): Promise<ProcessedContent[]> {
    const results: ProcessedContent[] = [];

    for (const input of inputs) {
      try {
        const processed = await this.processInput(input.type, input.source, options);
        if (processed) {
          results.push(processed);
        }
      } catch (error) {
        console.error(`Error processing input ${input.source}:`, error);
      }
    }

    return this.sortByPriority(results, inputs);
  }

  async processInput(
    type: string,
    source: string,
    options: ProcessingOptions = {}
  ): Promise<ProcessedContent | null> {
    switch (type) {
      case 'text':
        return this.processText(source, options);
      case 'pdf':
        return this.processPDF(source, options);
      case 'docx':
        return this.processDocx(source, options);
      case 'url':
        return this.processURL(source, options);
      default:
        console.warn(`Unsupported input type: ${type}`);
        return null;
    }
  }

  private async processText(text: string, options: ProcessingOptions): Promise<ProcessedContent> {
    const sections = options.extractSections ? this.extractSections(text) : [];

    return {
      id: this.generateId(),
      type: 'text',
      title: this.extractTitle(text),
      content: this.truncateContent(text, options.maxContentLength),
      sections,
      images: [],
      tables: [],
      citations: this.extractCitations(text),
      metadata: {
        wordCount: this.countWords(text),
        language: 'en',
        extractedAt: new Date(),
        source: 'text_input'
      }
    };
  }

  private async processPDF(source: string, options: ProcessingOptions): Promise<ProcessedContent | null> {
    try {
      const content = await this.extractPDFContent(source);
      const sections = options.extractSections ? this.extractSections(content) : [];

      return {
        id: this.generateId(),
        type: 'pdf',
        title: this.extractTitle(content),
        content: this.truncateContent(content, options.maxContentLength),
        sections,
        images: options.includeImages ? await this.extractPDFImages(source) : [],
        tables: options.includeTables ? await this.extractPDFTables(source) : [],
        citations: this.extractCitations(content),
        metadata: {
          wordCount: this.countWords(content),
          language: 'en',
          extractedAt: new Date(),
          source
        }
      };
    } catch (error) {
      console.error('Error processing PDF:', error);
      return null;
    }
  }

  private async processDocx(source: string, options: ProcessingOptions): Promise<ProcessedContent | null> {
    // Placeholder for DOCX processing
    console.log('DOCX processing not yet implemented');
    return null;
  }

  private async processURL(url: string, options: ProcessingOptions): Promise<ProcessedContent | null> {
    // Placeholder for URL processing
    console.log('URL processing not yet implemented');
    return null;
  }

  private extractSections(text: string): ContentSection[] {
    const sections: ContentSection[] = [];
    const lines = text.split('\n');

    let currentSection: ContentSection | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (this.isHeading(trimmed)) {
        if (currentSection) {
          sections.push(currentSection);
        }

        currentSection = {
          heading: trimmed.replace(/^#+\s*/, ''),
          content: '',
          level: this.getHeadingLevel(trimmed)
        };
      } else if (currentSection && trimmed) {
        currentSection.content += trimmed + '\n';
      }
    }

    if (currentSection) {
      sections.push(currentSection);
    }

    return sections;
  }

  private isHeading(line: string): boolean {
    return /^#+\s/.test(line) ||
           line.length < 100 &&
           line.toUpperCase() === line &&
           /^[A-Z\s]+$/.test(line);
  }

  private getHeadingLevel(line: string): number {
    const match = line.match(/^(#+)/);
    return match ? match[1].length : 1;
  }

  private extractTitle(text: string): string {
    const lines = text.split('\n').filter(line => line.trim());
    return lines[0]?.trim().substring(0, 100) || 'Untitled';
  }

  private extractCitations(text: string): string[] {
    const citationPatterns = [
      /https?:\/\/[^\s\)]+/g,
      /\[(\d+)\]/g,
      /\(([^,]+),\s*(\d{4})\)/g
    ];

    const citations: string[] = [];

    citationPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        citations.push(...matches);
      }
    });

    return [...new Set(citations)];
  }

  private countWords(text: string): number {
    return text.trim().split(/\s+/).length;
  }

  private truncateContent(content: string, maxLength?: number): string {
    if (!maxLength || content.length <= maxLength) {
      return content;
    }
    return content.substring(0, maxLength) + '...';
  }

  private async extractPDFContent(source: string): Promise<string> {
    // Placeholder - would use PDF parsing library
    return 'PDF content extraction not implemented';
  }

  private async extractPDFImages(source: string): Promise<string[]> {
    // Placeholder for PDF image extraction
    return [];
  }

  private async extractPDFTables(source: string): Promise<any[]> {
    // Placeholder for PDF table extraction
    return [];
  }

  private sortByPriority(
    results: ProcessedContent[],
    inputs: Array<{ priority?: number }>
  ): ProcessedContent[] {
    return results.sort((a, b) => {
      const aPriority = inputs.find((_, i) => i === results.indexOf(a))?.priority || 5;
      const bPriority = inputs.find((_, i) => i === results.indexOf(b))?.priority || 5;
      return bPriority - aPriority;
    });
  }

  private generateId(): string {
    return `content-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}