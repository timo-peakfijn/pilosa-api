import { Module } from '@nestjs/common';
import { MonitoringService } from './monitoring.service';
import { ServerInstanceService } from './server-instance.service';
import { TypeOrmModule } from '@nestjs/typeorm';
import { CloudProviderAccountService } from './cloud-provider-account.service';
import { ServersController } from './servers.controller';
import { CloudMetricsModule } from '@app/cloud-metrics';
import { CloudProviderAccount } from '@app/cloud/entities/cloud-provider-account.entity';
import { ServerInstance } from '@app/cloud/entities/service-instance.entity';
import { ScheduleModule } from '@nestjs/schedule';
import { registerEnumType } from '@nestjs/graphql';
import { CloudProvider } from '@app/cloud/enum/cloud-provider.enum';
import { CloudProviderAccountResolver } from '@app/cloud/graphql/resolvers/cloud-provider-account.resolver';
import { ServerInstanceResolver } from '@app/cloud/graphql/resolvers/server-instance.resolver';
import { MetricPeriod } from '@app/cloud/enum/metric-period.enum';

registerEnumType(CloudProvider, {
  name: 'CloudProvider',
});

registerEnumType(MetricPeriod, {
  name: 'MetricPeriod',
});

@Module({
  controllers: [ServersController],
  providers: [
    MonitoringService,
    ServerInstanceService,
    CloudProviderAccountService,
    CloudProviderAccountResolver,
    ServerInstanceResolver,
  ],
  imports: [
    CloudMetricsModule,
    TypeOrmModule.forFeature([CloudProviderAccount, ServerInstance]),
    ScheduleModule.forRoot(),
  ],
  exports: [CloudProviderAccountService],
})
export class CloudModule {}
