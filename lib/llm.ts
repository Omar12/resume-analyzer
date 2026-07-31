import OpenAI from "openai";

const provider = process.env.AI_PROVIDER ?? "openai";
const openAiKey = process.env.OPENAI_API_KEY;
const openAiModel = process.env.OPENAI_MODEL ?? "gpt-4.1-mini";

let client: OpenAI | null = null;

function getClient() {
  if (!openAiKey) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  if (!client) {
    client = new OpenAI({ apiKey: openAiKey });
  }

  return client;
}

export interface GenerateObjectOptions {
  system: string;
  input: string;
}

export async function generateJson({
  system,
  input
}: GenerateObjectOptions): Promise<string> {
  if (provider !== "openai") {
    throw new Error(`Unsupported AI_PROVIDER: ${provider}`);
  }

  const response = await getClient().responses.create({
    model: openAiModel,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: system }]
      },
      {
        role: "user",
        content: [{ type: "input_text", text: input }]
      }
    ]
  });

  return response.output_text;
}
