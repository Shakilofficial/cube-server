import {
  Injectable,
  NotFoundException,
  ConflictException,
  Logger,
} from "@nestjs/common";
import { PrismaService } from "../../core/prisma/prisma.service";
import { UpdateProfileDto } from "./dto/update-profile.dto";
import { ConfigService } from "@nestjs/config";
import { SearchService } from "../../core/search/search.service";
import { UserAuthHelper } from "./helpers/user-auth.helper";

@Injectable()
export class ProfileService {
  private readonly logger = new Logger(ProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly searchService: SearchService,
    private readonly userAuthHelper: UserAuthHelper,
  ) {}

  async getProfile(userId: string, email?: string, authHeader?: string) {
    let profile = await this.prisma.userProfile.findUnique({
      where: { id: userId },
      include: { preferences: true },
    });

    if (!profile) {
      const emailValue =
        email && email.trim() !== "" ? email : `${userId}@placeholder.com`;
      profile = await this.prisma.userProfile.create({
        data: {
          id: userId,
          email: emailValue,
          name: emailValue.split("@")[0],
          preferences: {
            create: {},
          },
        },
        include: { preferences: true },
      });
      // Sync on demand when initialized
      await this.syncUserToElastic(userId, null, authHeader);
    }

    return profile;
  }

  async upsertProfile(
    userId: string,
    email: string,
    data: UpdateProfileDto & { name?: string },
    authHeader?: string,
  ) {
    const profile = await this.prisma.userProfile.upsert({
      where: { id: userId },
      update: {
        ...(data.name && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.avatarUrl !== undefined && { avatarUrl: data.avatarUrl }),
      },
      create: {
        id: userId,
        email,
        name: data.name ?? "User",
        phone: data.phone,
        avatarUrl: data.avatarUrl,
      },
    });

    await this.syncUserToElastic(userId, null, authHeader);
    return profile;
  }

  async updateProfile(
    userId: string,
    dto: UpdateProfileDto,
    authHeader?: string,
  ) {
    let profile = await this.prisma.userProfile.findUnique({
      where: { id: userId },
    });

    let updatedProfile;
    if (!profile) {
      const emailValue = `${userId}@placeholder.com`;
      updatedProfile = await this.prisma.userProfile.create({
        data: {
          id: userId,
          email: emailValue,
          name: dto.name ?? emailValue.split("@")[0],
          phone: dto.phone,
          avatarUrl: dto.avatarUrl,
          preferences: {
            create: {},
          },
        },
      });
    } else {
      updatedProfile = await this.prisma.userProfile.update({
        where: { id: userId },
        data: {
          ...(dto.name && { name: dto.name }),
          ...(dto.phone !== undefined && { phone: dto.phone }),
          ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
        },
      });
    }

    await this.syncUserToElastic(userId, null, authHeader);
    return updatedProfile;
  }

  async createUserProfile(
    userId: string,
    email: string,
    name: string,
    phone?: string,
    authHeader?: string,
  ) {
    const profile = await this.prisma.userProfile.create({
      data: {
        id: userId,
        email,
        name,
        phone: phone || null,
        preferences: {
          create: {},
        },
      },
      include: {
        preferences: true,
      },
    });

    await this.syncUserToElastic(userId, null, authHeader);
    return profile;
  }

  async syncUserToElastic(userId: string, authUser?: any, authHeader?: string) {
    try {
      let account = authUser;
      if (!account) {
        account = await this.userAuthHelper.getUser(userId, authHeader);
      }

      if (!account) {
        this.logger.warn(
          `Could not sync user ${userId} to Elasticsearch: Account details not found in auth-service.`,
        );
        return;
      }

      const profile = await this.prisma.userProfile.findUnique({
        where: { id: userId },
      });

      if (!profile) {
        this.logger.warn(
          `Could not sync user ${userId} to Elasticsearch: Local profile details not found.`,
        );
        return;
      }

      await this.searchService.indexUser({
        id: userId,
        name: profile.name,
        email: profile.email,
        phone: profile.phone,
        avatarUrl: profile.avatarUrl,
        role: account.role,
        status: account.status,
        createdAt: account.createdAt || profile.createdAt,
      });
      await this.searchService.refreshIndex();
    } catch (error: any) {
      this.logger.error(
        `Error syncing user ${userId} to Elasticsearch:`,
        error.message || error,
      );
    }
  }

  async syncAllToElasticSearch(authHeader?: string) {
    try {
      const accounts = await this.userAuthHelper.getUsers(authHeader);

      const profiles = await this.prisma.userProfile.findMany();
      const profileMap = new Map<string, any>(
        profiles.map((p: any) => [p.id, p]),
      );

      let count = 0;
      for (const account of accounts) {
        const profile = profileMap.get(account.id);
        if (profile) {
          await this.searchService.indexUser({
            id: account.id,
            name: profile.name,
            email: profile.email,
            phone: profile.phone,
            avatarUrl: profile.avatarUrl,
            role: account.role,
            status: account.status,
            createdAt: account.createdAt || profile.createdAt,
          });
          count++;
        } else {
          // If profile does not exist yet, create a default one
          const emailValue = account.email || `${account.id}@placeholder.com`;
          const newProfile = await this.prisma.userProfile.create({
            data: {
              id: account.id,
              email: emailValue,
              name: emailValue.split("@")[0],
              preferences: {
                create: {},
              },
            },
          });
          await this.searchService.indexUser({
            id: account.id,
            name: newProfile.name,
            email: newProfile.email,
            phone: newProfile.phone,
            avatarUrl: newProfile.avatarUrl,
            role: account.role,
            status: account.status,
            createdAt: account.createdAt || newProfile.createdAt,
          });
          count++;
        }
      }
      await this.searchService.refreshIndex();
      return { count };
    } catch (error: any) {
      this.logger.error(
        "Error syncing all users to Elasticsearch:",
        error.message || error,
      );
      throw error;
    }
  }
}
