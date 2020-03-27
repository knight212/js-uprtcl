import { Property } from '@uprtcl/cortex';

import { MergeStrategy } from '../merge/merge-strategy';
import { UprtclAction } from '../types';

export interface Mergeable<T = any> extends Behaviour<T> {
  merge: (
    ancestor: T
  ) => (
    modifications: any[],
    strategy: MergeStrategy,
    config: any
  ) => Promise<[any, UprtclAction[]]>;
}
