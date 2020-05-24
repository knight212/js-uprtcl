import { injectable } from 'inversify';

import { EntryResult, HolochainProvider, parseEntriesResults } from '@uprtcl/holochain-provider';
import { Signed, Entity } from '@uprtcl/cortex';
import { KnownSourcesService, defaultCidConfig, CASStore } from '@uprtcl/multiplatform';

import { Perspective, Commit, PerspectiveDetails, NewPerspectiveData } from '../../../types';
import { EveesRemote } from '../../evees.remote';
import { Secured } from '../../../utils/cid-hash';
import { parseResponse } from '@uprtcl/holochain-provider';
import { EveesAccessControlHolochain } from './evees-access-control.holochain';
import { sortObject } from '@uprtcl/ipfs-provider';

@injectable()
export abstract class EveesHolochain extends HolochainProvider implements EveesRemote, CASStore {
  knownSources?: KnownSourcesService | undefined;
  zome: string = 'uprtcl';
  _casID!: string;

  instance = 'test-instance';

  get authority() {
    return this._casID;
  }

  get accessControl() {
    return new EveesAccessControlHolochain(this);
  }

  get proposals() {
    return undefined;
  }

  get casID() {
    return this._casID;
  }

  get cidConfig() {
    return {
      version: 1 as 1,
      type: 'sha2-256',
      codec: 'dag-cbor',
      base: 'base58btc'
    };
  }

  /**
   * @override
   */
  public async ready() {
    await super.ready();

    this._casID = await this.call('get_cas_id', {});
    this.userId = await this.call('get_my_address', {});
  }

  public async get(id: string): Promise<any | undefined> {
    const response = await this.call('get_entry', {
      entry_address: id
    });

    if (response === undefined) return undefined;

    return JSON.parse(response.App[1]);
  }

  async create(object: object, hash?: string | undefined): Promise<string> {
    return this.call('create_data', {
      data: JSON.stringify(sortObject(object)),
      proxy_address: hash
    });
  }

  /**
   * @override
   */
  async clonePerspective(perspective: Secured<Perspective>): Promise<void> {
    await this.call('clone_perspective', {
      previous_address: perspective.id,
      perspective: perspective.object
    });
  }

  /**
   * @override
   */
  async cloneCommit(commit: Secured<Commit>): Promise<void> {
    await this.call('clone_commit', {
      perspective_address: commit.id,
      commit: commit.object
    });
  }

  /**
   * @override
   */
  async updatePerspectiveDetails(
    perspectiveId: string,
    details: PerspectiveDetails
  ): Promise<void> {
    await this.call('update_perspective_details', {
      perspective_address: perspectiveId,
      details: {
        ...details,
        head: details.headId
      }
    });
  }

  /**
   * @override
   */
  async getContextPerspectives(context: string): Promise<string[]> {
    return this.call('get_context_perspectives', {
      context: context
    });
  }

  /**
   * @override
   */
  async getPerspectiveDetails(perspectiveId: string): Promise<PerspectiveDetails> {
    const result = await this.call('get_perspective_details', {
      perspective_address: perspectiveId
    });
    const details = parseResponse(result);
    return { ...details, headId: details.head };
  }

  async cloneAndInitPerspective(perspectiveData: NewPerspectiveData): Promise<void> {
    await this.clonePerspective(perspectiveData.perspective);
    return this.updatePerspectiveDetails(perspectiveData.perspective.id, perspectiveData.details);
    // TODO: addEditor
  }

  async clonePerspectivesBatch(newPerspectivesData: NewPerspectiveData[]): Promise<void> {
    const promises = newPerspectivesData.map(perspectiveData =>
      this.cloneAndInitPerspective(perspectiveData)
    );
    await Promise.all(promises);
  }

  deletePerspective(perspectiveId: string): Promise<void> {
    throw new Error('Method not implemented.');
  }
}
