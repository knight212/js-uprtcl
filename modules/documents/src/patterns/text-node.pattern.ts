import { ApolloClient } from 'apollo-boost';
import { html } from 'lit-element';
import { injectable, inject, multiInject } from 'inversify';

import {
  Pattern,
  recognizeEntity,
  Creatable,
  HasChildren,
  Entity,
  HasTitle,
  Newable
} from '@uprtcl/cortex';
import { CASStore } from '@uprtcl/multiplatform';
import {
  Mergeable,
  MergeStrategy,
  mergeStrings,
  mergeResult,
  UprtclAction,
  hashObject
} from '@uprtcl/evees';
import { Lens, HasLenses } from '@uprtcl/lenses';
import { ApolloClientModule } from '@uprtcl/graphql';
import { CidConfig } from '@uprtcl/multiplatform';

import { TextNode, TextType } from '../types';
import { DocumentsBindings } from '../bindings';

const propertyOrder = ['text', 'type', 'links'];

export class TextNodePattern extends Pattern<Entity<TextNode>> {
  recognize(object: object): boolean {
    return recognizeEntity(object) && propertyOrder.every(p => object.entity.hasOwnProperty(p));
  }

  type = 'TextNode';
}

@injectable()
export class TextNodeCommon
  implements
    HasLenses<Entity<TextNode>>,
    HasChildren<Entity<TextNode>>,
    Mergeable<Entity<TextNode>> {
  replaceChildrenLinks = (node: Entity<TextNode>) => (
    childrenHashes: string[]
  ): Entity<TextNode> => ({
    id: '',
    entity: {
      ...node.entity,
      links: childrenHashes
    }
  });

  getChildrenLinks = (node: Entity<TextNode>): string[] => node.entity.links;

  links = async (node: Entity<TextNode>) => this.getChildrenLinks(node);

  lenses = (node: Entity<TextNode>): Lens[] => {
    return [
      {
        name: 'documents:document',
        type: 'content',
        render: (entity: Entity<any>, context: any) => {
          return html`
            <documents-text-node .data=${node} ref=${entity.id}> </documents-text-node>
          `;
        }
      }
    ];
  };

  merge = (originalNode: Entity<TextNode>) => async (
    modifications: Entity<TextNode>[],
    mergeStrategy: MergeStrategy,
    config: any
  ): Promise<[TextNode, UprtclAction[]]> => {
    const resultText = mergeStrings(
      originalNode.entity.text,
      modifications.map(data => data.entity.text)
    );
    const resultType = mergeResult(
      originalNode.entity.type,
      modifications.map(data => data.entity.type)
    );

    const [mergedLinks, actions] = await mergeStrategy.mergeLinks(
      originalNode.entity.links,
      modifications.map(data => data.entity.links),
      config
    );

    return [
      {
        links: mergedLinks,
        text: resultText,
        type: resultType
      },
      actions
    ];
  };
}

@injectable()
export class TextNodeCreate implements Newable<Partial<TextNode>, TextNode> {
  constructor(
    @multiInject(DocumentsBindings.DocumentsRemote) protected stores: Array<CASStore>,
    @inject(ApolloClientModule.bindings.Client) protected client: ApolloClient<any>
  ) {}

  recognize(object: object): boolean {
    return propertyOrder.every(p => object.hasOwnProperty(p));
  }

  new = () => async (
    node: Partial<TextNode> | undefined,
    recipe: CidConfig
  ): Promise<Entity<TextNode>> => {
    const links = node && node.links ? node.links : [];
    const text = node && node.text ? node.text : '';
    const type = node && node.type ? node.type : TextType.Paragraph;

    const newTextNode = { links, text, type };
    const hash = await hashObject(newTextNode, recipe);
    return { id: hash, entity: newTextNode };
  };
}

@injectable()
export class TextNodeTitle implements HasTitle<Entity<TextNode>> {
  title = (textNode: Entity<TextNode>) => textNode.entity.text;
}
