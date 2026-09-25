import type { GeneratedUi } from "@/lib/agent/generate-ui-tool";

const BASIC_CATALOG = "https://a2ui.org/specification/v0_9/catalogs/basic/catalog.json";

export function convertToA2UI(input: GeneratedUi, surfaceId: string) {
  const children = ["title"];
  const components: Record<string, unknown>[] = [
    { id: "title", component: "Text", text: input.title, variant: "h1" },
  ];

  if (input.description) {
    children.push("description");
    components.push({ id: "description", component: "Text", text: input.description });
  }

  input.sections.forEach((section, index) => {
    const cardId = `section-${index}`;
    const contentId = `${cardId}-content`;
    const titleId = `${cardId}-title`;
    const descriptionId = `${cardId}-description`;

    children.push(cardId);
    components.push(
      { id: cardId, component: "Card", child: contentId },
      { id: contentId, component: "Column", children: [titleId, descriptionId] },
      { id: titleId, component: "Text", text: section.title, variant: "h2" },
      { id: descriptionId, component: "Text", text: section.description },
    );
  });

  components.unshift({ id: "root", component: "Column", children });

  return [
    {
      version: "v0.9",
      createSurface: { surfaceId, catalogId: BASIC_CATALOG },
    },
    {
      version: "v0.9",
      updateComponents: { surfaceId, components },
    },
  ];
}
