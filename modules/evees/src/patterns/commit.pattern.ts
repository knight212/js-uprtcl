import { injectable, inject, multiInject } from 'inversify';
import { html } from 'lit-element';
import { ApolloClient } from 'apollo-boost';

import { Pattern, HasRedirect, HasLinks, Creatable, Entity, Signed, Newable } from '@uprtcl/cortex';
import { Lens, HasLenses } from '@uprtcl/lenses';
import { CidConfig } from '@uprtcl/multiplatform';
import { ApolloClientModule } from '@uprtcl/graphql';

import { Commit } from '../types';
import { EveesBindings } from '../bindings';
import { EveesRemote } from '../services/evees.remote';
import { CREATE_COMMIT } from '../graphql/queries';
import { CreateCommitArgs } from '../services/evees';
import { extractSignedEntity, signAndHashObject } from './signed';

export const propertyOrder = ['creatorsIds', 'timestamp', 'message', 'parentsIds', 'dataId'];

export class CommitEntity extends Pattern<Entity<Signed<Commit>>> {
  recognize(entity: object) {
    const object = extractSignedEntity(entity);

    return object && propertyOrder.every(p => object.hasOwnProperty(p));
  }

  type = 'Commit';
}

@injectable()
export class CommitLinked
  implements HasLinks<Entity<Signed<Commit>>>, HasRedirect<Entity<Signed<Commit>>> {
  links: (commit: Entity<Signed<Commit>>) => Promise<string[]> = async (
    commit: Entity<Signed<Commit>>
  ): Promise<string[]> => [commit.entity.payload.dataId, ...commit.entity.payload.parentsIds];

  getChildrenLinks: (commit: Entity<Signed<Commit>>) => string[] = (
    commit: Entity<Signed<Commit>>
  ) => [] as string[];

  replaceChildrenLinks = (
    commit: Entity<Signed<Commit>>,
    newLinks: string[]
  ): Entity<Signed<Commit>> => commit;

  redirect: (commit: Entity<Signed<Commit>>) => Promise<string | undefined> = async (
    commit: Entity<Signed<Commit>>
  ) => commit.entity.payload.dataId;
}

@injectable()
export class CommitLens implements HasLenses<Entity<Signed<Commit>>> {
  lenses: (commit: Entity<Signed<Commit>>) => Lens[] = (commit: Entity<Signed<Commit>>): Lens[] => {
    return [
      {
        name: 'evees:commit-history',
        type: 'version-control',
        render: () => html`
          <evees-commit-history .headId=${commit.id}></evees-commit-history>
        `
      }
    ];
  };
}

@injectable()
export class CommitPattern
  implements Creatable<Commit, Signed<Commit>>, Newable<Commit, Signed<Commit>> {
  constructor(
    @multiInject(EveesBindings.EveesRemote) protected remotes: EveesRemote[],
    @inject(ApolloClientModule.bindings.Client) protected client: ApolloClient<any>
  ) {}

  create = () => async (args: CreateCommitArgs, casID: string) => {
    args.timestamp = args.timestamp || Date.now();
    args.message = args.message || `Commit at ${Date.now()}`;
    args.parentsIds = args.parentsIds || [];

    const remote = this.remotes.find(r => r.casID === casID);
    if (remote === undefined) throw new Error(`remote ${casID} not found`);
    if (!args.creatorsIds) {
      if (!remote || !remote.userId)
        throw new Error(
          'You must be signed in the evees remote you are trying to create the commit on or specify the creators ids'
        );

      args.creatorsIds = [remote.userId];
    }

    const commit = await this.new()(args as Commit, remote.cidConfig);
    const result = await this.client.mutate({
      mutation: CREATE_COMMIT,
      variables: {
        ...args,
        source: casID
      }
    });
    if (result.data.createCommit.id != commit[0]) {
      throw new Error('unexpected id');
    }
    return {
      id: commit[0],
      entity: commit[1],
      casID
    };
  };

  new = () => async (args: Commit, recipe: CidConfig) => {
    if (!args) throw new Error('Cannot create commit without specifying its details');

    const timestamp = args.timestamp || Date.now();
    const creatorsIds = args.creatorsIds;

    const commitData: Commit = {
      creatorsIds: creatorsIds,
      dataId: args.dataId,
      message: args.message,
      timestamp: timestamp,
      parentsIds: args.parentsIds
    };

    return signAndHashObject(commitData, recipe);
  };
}
