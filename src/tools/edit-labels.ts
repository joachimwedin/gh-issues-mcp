import { z } from "zod";
import { editLabels } from "../github.js";
import { defineTool } from "./define-tool.js";

export interface EditLabelsInput {
  number: number;
  add?: string[];
  remove?: string[];
}

export const editLabelsInputSchema = {
  number: z.number().int(),
  add: z.array(z.string()).optional(),
  remove: z.array(z.string()).optional(),
};

function invalidLabels(labels: string[] | undefined, vocabulary: string[]): string[] {
  return (labels ?? []).filter((label) => !vocabulary.includes(label));
}

export const editLabelsTool = defineTool<EditLabelsInput>({
  name: "edit_labels",
  description: "Add and/or remove labels on the given issue, restricted to the configured label vocabulary.",
  inputSchema: editLabelsInputSchema,
  validate(input, context) {
    const invalid = [
      ...invalidLabels(input.add, context.labelVocabulary),
      ...invalidLabels(input.remove, context.labelVocabulary),
    ];

    if (invalid.length === 0) return undefined;

    return {
      isError: true,
      content: [
        {
          type: "text",
          text: `Label(s) not in the configured vocabulary: ${invalid.join(", ")}. Allowed labels: ${context.labelVocabulary.join(", ")}.`,
        },
      ],
    };
  },
  call: (context, input) => editLabels(context.github, input),
});
