import { Entity } from '../entity';

export class LinkedEntity<T extends object> extends Entity<T> {
  /**
   * @override
   */
  public async getLinks(): Promise<string[]> {
    const softLinks = await this.getSoftLinks();
    return this.getHardLinks().concat(softLinks);
  }

  /**
   * @returns the hard links contained in the object, that can't change
   */
  public getHardLinks(): string[] {
    return [];
  }

  /**
   * @returns the soft links that can change throughout the object lifecycle
   */
  public async getSoftLinks(): Promise<string[]> {
    return [];
  }
}