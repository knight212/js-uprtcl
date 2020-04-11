import gql from 'graphql-tag';
import { injectable, inject } from 'inversify';
import { ApolloClient } from 'apollo-boost';

import { Dictionary } from '@uprtcl/micro-orchestrator';
import { HasChildren, Hashed, CortexModule, PatternRecognizer, Pattern, IsSecure } from '@uprtcl/cortex';
import { ApolloClientModule } from '@uprtcl/graphql';
import { DiscoveryService, DiscoveryModule, EntityCache } from '@uprtcl/multiplatform';

import { SimpleMergeStrategy } from './simple.merge-strategy';
import {
  Commit,
  UprtclAction,
  UPDATE_HEAD_ACTION,
  CREATE_COMMIT_ACTION,
  CREATE_DATA_ACTION,
  UpdateRequest,
  RemotesConfig,
  NodeActions
} from '../types';
import { EveesBindings } from '../bindings';
import { Evees, CidHashedPattern } from '../uprtcl-evees';

@injectable()
export class RecursiveContextMergeStrategy extends SimpleMergeStrategy {
  perspectivesByContext!: Dictionary<{
    to: string | undefined;
    from: string | undefined;
  }>;

  allPerspectives!: Dictionary<string>;

  constructor(
    @inject(EveesBindings.RemotesConfig) protected remotesConfig: RemotesConfig,
    @inject(EveesBindings.Evees) protected evees: Evees,
    @inject(CortexModule.bindings.Recognizer) protected recognizer: PatternRecognizer,
    @inject(ApolloClientModule.bindings.Client) protected client: ApolloClient<any>,
    @inject(DiscoveryModule.bindings.EntityCache) protected entityCache: EntityCache,
    @inject(EveesBindings.Secured) protected secured: Pattern & IsSecure<any>,
    @inject(EveesBindings.Hashed) protected hashed: CidHashedPattern,
    @inject(DiscoveryModule.bindings.DiscoveryService) protected discovery: DiscoveryService) {
      
      super(remotesConfig, evees, recognizer, client, entityCache, secured, hashed);
  }

  async isPattern(id: string, name: string): Promise<boolean> {
    const entity = await this.discovery.get(id) as object;
    const pattern = this.recognizer.recognize(entity);
    return pattern.findIndex(p => p.name === name) !== -1;
  }

  setPerspective(perspectiveId: string, context: string, to: boolean): void {
    if (!this.perspectivesByContext[context]) {
      this.perspectivesByContext[context] = {
        to: undefined,
        from: undefined
      };
    }

    if (to) {
      this.perspectivesByContext[context].to = perspectiveId;
    } else {
      this.perspectivesByContext[context].from = perspectiveId;
    }

    this.allPerspectives[perspectiveId] = context;
  }

  async readPerspective(perspectiveId: string, to: boolean): Promise<void> {
    const result = await this.client.query({
      query: gql`{
        entity(id: "${perspectiveId}") {
          id
          ... on Perspective {
            head {
              id
              data {
                id
                _context {
                  raw
                }
              }
            }

            context {
              id
            }
          }
        }
      }`
    });

    const context = result.data.entity.context.id;
    const jsonData = result.data.entity.head.data._context.raw;

    const dataObject = JSON.parse(jsonData);
    if (result.data.entity.head == null) {
      throw new Error(`head null reading perspective ${perspectiveId}`);
    }
    
    this.setPerspective(perspectiveId, context, to);

    const hasChildren: HasChildren | undefined = this.recognizer
      .recognize(dataObject)
      .find(prop => !!(prop as HasChildren).getChildrenLinks);

    if (hasChildren) {
      const links = hasChildren.getChildrenLinks(dataObject);

      const promises = links.map(async (link) => {
        const isPerspective = await this.isPattern(link, "Perspective");
        if (isPerspective) {
          this.readPerspective(link, to)
        } else {
          Promise.resolve();
        }
      });
      
      await Promise.all(promises);
    }
  }

  async readAllSubcontexts(toPerspectiveId: string, fromPerspectiveId: string): Promise<void> {
    const promises = [
      this.readPerspective(toPerspectiveId, true),
      this.readPerspective(fromPerspectiveId, false)
    ];

    await Promise.all(promises);
  }

  async mergePerspectives(
    toPerspectiveId: string,
    fromPerspectiveId: string
  ): Promise<NodeActions<string>> {
    let root = false;
    if (!this.perspectivesByContext) {
      root = true;
      this.perspectivesByContext = {};
      this.allPerspectives = {};
      await this.readAllSubcontexts(toPerspectiveId, fromPerspectiveId);
    }

    return super.mergePerspectives(toPerspectiveId, fromPerspectiveId);
  }

  private async getPerspectiveContext(perspectiveId: string): Promise<string> {
    if (this.allPerspectives[perspectiveId]) {
      return this.allPerspectives[perspectiveId];
    } else {
      const result = await this.client.query({
        query: gql`{
          entity(id: "${perspectiveId}") {
            id
            ... on Perspective {
              context{
                id
              }
            }
          }
        }`
      });

      const context = result.data.entity.context.id;

      if (!context)
        throw new Error(
          `Cannot merge based on context: context of perspective with id ${perspectiveId} is undefined`
        );

      return context;
    }
  }

  async getLinkMergeId(link: string) {
    const isPerspective = await this.isPattern(link, "Perspective");
    if (isPerspective) {
      return this.getPerspectiveContext(link);
    } else {
      return Promise.resolve(link);
    }
  } 

  async mergeLinks(
    originalLinks: string[],
    modificationsLinks: string[][]
  ): Promise<NodeActions<string>[]> {
    /** The context is used as Merge ID for perspective to have a context-based merge. For othe
     * type of entities, like commits or data, the link itself is used is mergeId */
    const originalPromises = originalLinks.map(link => this.getLinkMergeId(link));
    const modificationsPromises = modificationsLinks.map(links =>
      links.map(link => this.getLinkMergeId(link))
    );

    const originalMergeIds = await Promise.all(originalPromises);
    const modificationsMergeIds = await Promise.all(
      modificationsPromises.map(promises => Promise.all(promises))
    );

    const mergedLinks = await super.mergeLinks(
      originalMergeIds,
      modificationsMergeId
    );

    const dictionary = this.perspectivesByContext;

    const mergeLinks = mergedLinks.map(
      async mergeResult => {
        const perspectivesByContext = dictionary[mergeResult.id];
        
        const needsSubperspectiveMerge =
          perspectivesByContext && perspectivesByContext.to && perspectivesByContext.from;

        if (needsSubperspectiveMerge) {
          // We need to merge the new perspectives with the original perspective
          const { actions } = await this.mergePerspectives(
            perspectivesByContext.to as string,
            perspectivesByContext.from as string
          );

          // The final perspective has not changed
          return {
            id: perspectivesByContext.to as string, 
            actions: actions.concat(...mergeResult.actions)
          } 
        } else {
          const finalPerspectiveId = perspectivesByContext.to
            ? perspectivesByContext.to
            : perspectivesByContext.from;

          /** TODO: why is this needed? its creating abug when merging wiki
           * with one page and one paragraph into a wiki without pages.
           * only one head update is expected, but two are found. The head
           * of the page is updated but it should not.
           */
          // const actions = await this.mergePerspectiveChildren(finalPerspectiveId as string, config);
          const actions = [];

          return {
            id: finalPerspectiveId as string, 
            actions
          }
        }
      }
    );

    const mergeResults = await Promise.all(mergeLinks);
    
    return mergeResults;
  }

  protected async updatePerspectiveData(
    perspectiveId: string,
    data: any
  ): Promise<Array<UprtclAction>> {
    const result = await this.client.query({
      query: gql`{
        entity(id: "${perspectiveId}") {
          id
          ... on Perspective {
            head {
              id
            }
            payload {
              origin
            }
          }
        }
      }`
    });

    const origin = result.data.entity.payload.origin;
    const headId = result.data.entity.head.id;

    const remote = this.evees.getAuthority(origin);

    if (!remote.userId)
      throw new Error('Cannot create perspectives in a remote you are not signed in');

    const dataSource = this.remotesConfig.map(remote.authority);

    const newHasheData = await this.hashed.derive()(data, dataSource.hashRecipe);

    const newDataAction: UprtclAction = {
      type: CREATE_DATA_ACTION,
      entity: newHasheData,
      payload: {
        source: dataSource.source
      }
    };

    this.entityCache.cacheEntity(newHasheData);

    const commit: Commit = {
      dataId: newHasheData.id,
      parentsIds: headId ? [headId] : [],
      creatorsIds: [remote.userId],
      message: 'Merge: reference new commits',
      timestamp: Date.now()
    };

    const securedCommit = await this.secured.derive()(commit, remote.hashRecipe);

    const newCommitAction: UprtclAction = {
      type: CREATE_COMMIT_ACTION,
      entity: securedCommit,
      payload: {
        source: remote.source
      }
    };

    this.entityCache.cacheEntity(securedCommit);

    const updateRequest: UpdateRequest = {
      fromPerspectiveId: undefined,
      perspectiveId,
      oldHeadId: headId,
      newHeadId: securedCommit.id
    };

    const updateHead = this.buildUpdateAction(updateRequest);

    return [updateHead, newCommitAction, newDataAction];
  }
  
}
