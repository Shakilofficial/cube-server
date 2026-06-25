import { Injectable, OnModuleInit, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Client } from "@elastic/elasticsearch";

export interface UserDoc {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  role: string;
  status: string;
  avatarUrl?: string | null;
  createdAt: Date | string;
}

export interface SearchUsersParams {
  search?: string;
  role?: string;
  status?: string;
  page: number;
  limit: number;
  sortBy: string;
  sortOrder: string;
}

@Injectable()
export class SearchService implements OnModuleInit {
  private client: Client;
  private readonly logger = new Logger(SearchService.name);

  constructor(private readonly config: ConfigService) {
    const node =
      this.config.get<string>("ELASTICSEARCH_NODE") || "http://localhost:9200";
    this.client = new Client({ node });
  }

  async onModuleInit() {
    try {
      const exists = await this.client.indices.exists({ index: "users" });
      if (!exists) {
        await this.client.indices.create({
          index: "users",
          mappings: {
            properties: {
              id: { type: "keyword" },
              name: { type: "text", analyzer: "standard" },
              email: { type: "keyword" },
              phone: { type: "keyword" },
              role: { type: "keyword" },
              status: { type: "keyword" },
              avatarUrl: { type: "keyword" },
              createdAt: { type: "date" },
            },
          },
        });
        this.logger.log('Elasticsearch index "users" created successfully.');
      } else {
        this.logger.log('Elasticsearch index "users" already exists.');
      }
    } catch (error: any) {
      this.logger.error(
        'Failed to initialize Elasticsearch index "users":',
        error.message || error,
      );
    }
  }

  async indexUser(user: UserDoc) {
    try {
      await this.client.index({
        index: "users",
        id: user.id,
        document: {
          id: user.id,
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          role: user.role,
          status: user.status,
          avatarUrl: user.avatarUrl || null,
          createdAt: user.createdAt,
        },
      });
      this.logger.log(`Indexed user document: ${user.id}`);
    } catch (error: any) {
      this.logger.error(
        `Failed to index user document ${user.id}:`,
        error.message || error,
      );
    }
  }

  async deleteUser(userId: string) {
    try {
      await this.client.delete({ index: "users", id: userId });
      this.logger.log(`Deleted user document: ${userId}`);
    } catch (error: any) {
      if (error.meta?.statusCode !== 404) {
        this.logger.error(
          `Failed to delete user document ${userId}:`,
          error.message || error,
        );
      }
    }
  }

  async refreshIndex() {
    try {
      await this.client.indices.refresh({ index: "users" });
      this.logger.log("Refreshed index: users");
    } catch (error: any) {
      this.logger.error(
        'Failed to refresh index "users":',
        error.message || error,
      );
    }
  }

  async searchUsers(params: SearchUsersParams) {
    const from = (params.page - 1) * params.limit;
    const size = params.limit;

    const must: any[] = [];
    const filter: any[] = [];

    if (params.role) {
      filter.push({ term: { role: params.role } });
    }
    if (params.status) {
      filter.push({ term: { status: params.status } });
    }

    if (params.search) {
      must.push({
        bool: {
          should: [
            {
              wildcard: {
                name: { value: `*${params.search.toLowerCase()}*`, boost: 2.0 },
              },
            },
            {
              wildcard: {
                email: { value: `*${params.search.toLowerCase()}*` },
              },
            },
            {
              wildcard: {
                phone: { value: `*${params.search.toLowerCase()}*` },
              },
            },
            {
              multi_match: {
                query: params.search,
                fields: ["name^2", "email", "phone"],
                fuzziness: "AUTO",
              },
            },
          ],
          minimum_should_match: 1,
        },
      });
    } else {
      must.push({ match_all: {} });
    }

    const sort: any = [{ [params.sortBy]: { order: params.sortOrder } }];

    try {
      const response = await this.client.search<UserDoc>({
        index: "users",
        from,
        size,
        query: { bool: { must, filter } },
        sort,
      });

      const totalValue = response.hits.total;
      const total =
        typeof totalValue === "number"
          ? totalValue
          : (totalValue as any)?.value || 0;
      const data = response.hits.hits.map((hit) => hit._source as UserDoc);

      return {
        meta: { page: params.page, limit: params.limit, total },
        data,
      };
    } catch (error: any) {
      this.logger.error("Elasticsearch search error:", error.message || error);
      return {
        meta: { page: params.page, limit: params.limit, total: 0 },
        data: [],
      };
    }
  }
}
