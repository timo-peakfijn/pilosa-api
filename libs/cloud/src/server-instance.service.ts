import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Instance } from './cloud-provider-instance-list.interface';
import { Project } from '@app/project/entities/project.entity';
import { CloudProviderAccount } from '@app/cloud/entities/cloud-provider-account.entity';
import { ServerInstance } from '@app/cloud/entities/service-instance.entity';

@Injectable()
export class ServerInstanceService {
  constructor(
    @InjectRepository(ServerInstance)
    private serverInstanceRepository: Repository<ServerInstance>,
  ) {}

  async findOneById(id: string): Promise<ServerInstance> {
    return this.serverInstanceRepository
      .createQueryBuilder('si')
      .where('si.id = :id', { id })
      .getOne();
  }

  /**
   * Find the last imported server instance for a provider,
   * and that was imported more than 5 minutes ago.
   */
  async findOrCreateOneByInstanceId(
    instance: Instance,
    cloudProviderAccount: CloudProviderAccount,
  ): Promise<ServerInstance | null> {
    const serverInstance = await this.serverInstanceRepository
      .createQueryBuilder('ci')
      .where('ci.instanceId = :instanceId', { instanceId: instance.id })
      .andWhere('ci.cloudProviderAccount = :cloudProviderAccount', {
        cloudProviderAccount: cloudProviderAccount.id,
      })
      .getOne();

    if (serverInstance) {
      serverInstance.state = instance.state;
      serverInstance.tags = instance.tags;

      return this.save(serverInstance);
    }

    const newInstance = new ServerInstance();
    newInstance.instanceId = instance.id;
    newInstance.class = instance.class;
    newInstance.state = instance.state;
    newInstance.cloudProviderAccount = cloudProviderAccount;
    newInstance.tags = instance.tags;

    return this.save(newInstance);
  }

  findAllByProject(projectId: Project['id']): Promise<ServerInstance[]> {
    return this.serverInstanceRepository
      .createQueryBuilder('si')
      .innerJoin('si.cloudProviderAccount', 'cpa')
      .innerJoin('cpa.project', 'project', 'project.id = :projectId', {
        projectId,
      })
      .getMany();
  }

  findAllByCloudProviderAccount(
    cloudProviderAccount: CloudProviderAccount,
  ): Promise<ServerInstance[]> {
    return this.serverInstanceRepository
      .createQueryBuilder('si')
      .where('si.cloudProviderAccount = :cloudProviderAccountId', {
        cloudProviderAccountId: cloudProviderAccount.id,
      })
      .getMany();
  }

  /**
   * Save a server instance.
   *
   * @param serverInstance
   */
  async save(serverInstance: ServerInstance): Promise<ServerInstance> {
    return this.serverInstanceRepository.save(serverInstance);
  }
}
