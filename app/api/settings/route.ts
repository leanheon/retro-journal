import { requireBlogOwner } from "../../lib/auth";
import { databaseErrorMessage, getSettings, saveSettings } from "../../lib/db";
import { jsonError, noStoreHeaders, publicCacheHeaders, sameOriginError } from "../../lib/http";
import { validateSettingsInput } from "../../lib/validation";
import type { SettingsInput } from "../../lib/types";

export async function GET() {
  try {
    return Response.json({ settings: await getSettings() }, { headers: publicCacheHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}

export async function PUT(request: Request) {
  const originError = sameOriginError(request);
  if (originError) return originError;
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  let payload: SettingsInput;
  try {
    payload = (await request.json()) as SettingsInput;
  } catch {
    return jsonError("JSON 형식의 본문을 보내 주세요.");
  }
  const result = validateSettingsInput(payload, { partial: true });
  if (!result.ok) return jsonError(result.error);
  if (Object.keys(result.value).length === 0) {
    return jsonError("수정할 설정을 하나 이상 입력해 주세요.");
  }

  try {
    const current = await getSettings();
    const settings = await saveSettings({ ...current, ...result.value });
    return Response.json({ settings }, { headers: noStoreHeaders() });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}
