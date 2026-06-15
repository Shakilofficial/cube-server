import { Injectable, OnModuleInit, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from '@elastic/elasticsearch';

/** Shape of a product document stored in Elasticsearch (from spec 2.3) */
export interface ProductDocument {
  id: string;
  sku: string;
  name: string;
  description: string;
  brandName: string;
  categoryNames: string[];
  price: number;
  status: string;
  avgRating: number;
  reviewCount: number;
  inStock: boolean;
  createdAt: string;
}

@Injectable()
export class ProductIndexService implements OnModuleInit {
  readonly INDEX = 'products';
  private readonly logger = new Logger(ProductIndexService.name);
  private readonly client: Client;

  constructor(private readonly config: ConfigService) {
    const node =
      this.config.get<string>('ELASTICSEARCH_NODE') || 'http://localhost:9200';
    this.client = new Client({ node });
  }

  async onModuleInit() {
    await this.createIndex();
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Index lifecycle
  // ─────────────────────────────────────────────────────────────────────────

  async createIndex(): Promise<void> {
    try {
      const exists = await this.client.indices.exists({ index: this.INDEX });
      if (exists) {
        this.logger.log(`Elasticsearch index "${this.INDEX}" already exists.`);
        return;
      }

      await this.client.indices.create({
        index: this.INDEX,
        mappings: {
          properties: {
            id:            { type: 'keyword' },
            sku:           { type: 'keyword' },
            name:          { type: 'text', analyzer: 'standard', boost: 3 },
            description:   { type: 'text', analyzer: 'standard' },
            brandName:     { type: 'text', fields: { keyword: { type: 'keyword' } } },
            categoryNames: { type: 'text', fields: { keyword: { type: 'keyword' } } },
            price:         { type: 'float' },
            status:        { type: 'keyword' },
            avgRating:     { type: 'float' },
            reviewCount:   { type: 'integer' },
            inStock:       { type: 'boolean' },
            createdAt:     { type: 'date' },
          },
        },
      });

      this.logger.log(`Elasticsearch index "${this.INDEX}" created successfully.`);
    } catch (err: any) {
      this.logger.error(
        `Failed to initialize Elasticsearch index "${this.INDEX}": ${err.message}`,
      );
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Document operations
  // ─────────────────────────────────────────────────────────────────────────

  async upsert(doc: ProductDocument): Promise<void> {
    try {
      await this.client.index({
        index: this.INDEX,
        id: doc.id,
        document: doc,
      });
      this.logger.log(`Indexed product: ${doc.id} (${doc.sku})`);
    } catch (err: any) {
      this.logger.error(`Failed to index product ${doc.id}: ${err.message}`);
    }
  }

  async delete(id: string): Promise<void> {
    try {
      await this.client.delete({ index: this.INDEX, id });
      this.logger.log(`Deleted product from index: ${id}`);
    } catch (err: any) {
      if (err.meta?.statusCode !== 404) {
        this.logger.error(`Failed to delete product ${id}: ${err.message}`);
      }
    }
  }

  getClient(): Client {
    return this.client;
  }
}
