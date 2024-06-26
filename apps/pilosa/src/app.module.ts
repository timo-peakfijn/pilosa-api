import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ProjectModule } from '@app/project';
import { validationSchema } from './config/validation.schema';
import configuration, { DatabaseConfig } from './config/configuration';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WebSnippetModule } from './web-snippet/web-snippet.module';
import { CloudAwsModule } from '@app/cloud-aws';
import { CloudModule } from '@app/cloud';
import { WebMetricsModule } from '@app/web-metrics';
import { FrontendApp } from '@app/web-metrics/entities/frontend-app.entity';
import { BrowserMetric } from '@app/web-metrics/entities/browser-metric.entity';
import { CloudMetricsModule } from '@app/cloud-metrics';
import { ServerMetric } from '@app/cloud-metrics/entities/server-metric.entity';
import { CloudProviderAccount } from '@app/cloud/entities/cloud-provider-account.entity';
import { ServerInstance } from '@app/cloud/entities/service-instance.entity';
import { HealthModule } from '@app/health';
import { AuthModule } from '@app/auth';
import { UserModule } from '@app/user';
import { User } from '@app/user/entities/user.entity';
import { APP_GUARD } from '@nestjs/core';
import { JwtAuthGuard } from '@app/auth/guards/jwt-auth.guard';
import { GraphQLModule } from '@nestjs/graphql';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import * as path from 'path';
import { Organization } from '@app/project/entities/organization.entity';
import { UserOrganizationRole } from '@app/project/entities/user-organization-role.entity';
import { UserProjectRole } from '@app/project/entities/user-project-role.entity';
import { Project } from '@app/project/entities/project.entity';
import { MetricsModule } from '@app/metrics';
import { BrowserMetricCrossOrigin } from '@app/web-metrics/entities/browser-metric-cross-origin.entity';
import { SyntheticScanModule } from '@app/synthetic-scan';
import { CacheModule } from '@nestjs/cache-manager';

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
  imports: [
    CacheModule.register({
      isGlobal: true,
    }),
    ConfigModule.forRoot({
      load: [configuration],
      validationSchema,
    }),
    GraphQLModule.forRoot<ApolloDriverConfig>({
      driver: ApolloDriver,
      autoSchemaFile: path.join(process.cwd(), 'src/schema.gql'),
      allowBatchedHttpRequests: true,
      sortSchema: true,
    }),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: (configService: ConfigService) => {
        const { port, host, database, username, password, ssl } =
          configService.get<DatabaseConfig>('database');

        return {
          type: 'postgres',
          host,
          port,
          username,
          password,
          database,
          ssl,
          entities: [
            BrowserMetric,
            BrowserMetricCrossOrigin,
            CloudProviderAccount,
            FrontendApp,
            Organization,
            Project,
            ServerInstance,
            ServerMetric,
            User,
            UserOrganizationRole,
            UserProjectRole,
          ],
          migrations: ['dist/apps/pilosa/apps/pilosa/src/db/*-migrations.js'],
          cli: {
            migrationsDir: 'src/db/migrations',
          },
        };
      },
      inject: [ConfigService],
    }),
    AuthModule,
    ProjectModule,
    WebMetricsModule,
    MetricsModule,
    CloudMetricsModule,
    CloudModule,
    CloudAwsModule,
    UserModule,
    WebSnippetModule,
    HealthModule,
    SyntheticScanModule,
  ],
})
export class AppModule {}
