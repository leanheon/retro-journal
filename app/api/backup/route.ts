import { requireBlogOwner } from "../../lib/auth";
import { databaseErrorMessage, getBackup } from "../../lib/db";
import { jsonError, noStoreHeaders } from "../../lib/http";

export async function GET() {
  const owner = await requireBlogOwner();
  if (!owner.ok) return owner.response;

  try {
    const backup = await getBackup();
    return Response.json(backup, {
      headers: {
        ...noStoreHeaders(),
        "Content-Disposition": 'attachment; filename="yeobaek-records-backup.json"',
      },
    });
  } catch (error) {
    return jsonError(databaseErrorMessage(error), 500);
  }
}
