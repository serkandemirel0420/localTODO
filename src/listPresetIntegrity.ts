export type ListMenuNodeLike = {
  label: string;
  children?: ListMenuNodeLike[];
};

export type PresetListReferenceLike = {
  filters?: {
    list?: readonly string[];
  };
  requiredFilters?: {
    list?: readonly string[];
  };
  sections?: readonly PresetListReferenceLike[];
};

const getListLabelKeys = (label: string) => [
  label.toLocaleLowerCase(),
  label.toLocaleLowerCase('tr-TR'),
];

/**
 * Repairs legacy settings where a saved preset still targets a list that is
 * missing from the canonical list tree. Presets remain navigation/filter
 * configuration; the repaired list node becomes the durable list identity.
 */
export const ensureListMenuTreeCoversPresetLists = <TNode extends ListMenuNodeLike>(
  nodes: TNode[],
  presets: readonly PresetListReferenceLike[],
  createNode: (label: string) => TNode,
): TNode[] => {
  const knownLabels = new Set<string>();

  const collectNodeLabels = (items: readonly ListMenuNodeLike[]) => {
    items.forEach((item) => {
      getListLabelKeys(item.label.trim()).forEach((key) => knownLabels.add(key));
      if (item.children?.length) {
        collectNodeLabels(item.children);
      }
    });
  };

  collectNodeLabels(nodes);

  const missingLabels: string[] = [];
  const collectPresetLabels = (items: readonly PresetListReferenceLike[]) => {
    items.forEach((item) => {
      const referencedLabels = [
        ...(item.filters?.list ?? []),
        ...(item.requiredFilters?.list ?? []),
      ];

      referencedLabels.forEach((rawLabel) => {
        const label = rawLabel.trim();
        const keys = getListLabelKeys(label);
        if (!label || keys.some((key) => knownLabels.has(key))) {
          return;
        }

        keys.forEach((key) => knownLabels.add(key));
        missingLabels.push(label);
      });

      if (item.sections?.length) {
        collectPresetLabels(item.sections);
      }
    });
  };

  collectPresetLabels(presets);

  if (missingLabels.length === 0) {
    return nodes;
  }

  return [
    ...nodes,
    ...missingLabels.map(createNode),
  ];
};
