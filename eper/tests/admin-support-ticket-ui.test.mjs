import test from "node:test";
import assert from "node:assert/strict";
import { adminSupportTicketUiHtml } from "../dist/apps/api/admin-support-ticket-ui.js";

test("support admin queue exports only the currently loaded authorized page", () => {
  const html = adminSupportTicketUiHtml;
  assert.match(html, /id="exportTicketPage"/);
  assert.match(html, /Export current page \(CSV\)/);
  assert.ok(html.includes('...tickets.map(ticket=>columns.map(column=>csvCell(ticket[column])).join(","))'));
  assert.ok(html.includes('const columns=["id","title","type","severity","status","applicationId","createdBy","assignedTo","createdAt","updatedAt"]'));
  assert.ok(html.includes('el("exportTicketPage").disabled=tickets.length===0'));
});

test("support ticket CSV export neutralizes formula cells and keeps the download URL alive briefly", () => {
  const html = adminSupportTicketUiHtml;
  assert.ok(html.includes('/^[\\s]*[=+\\-@]/.test(text)'), "formula-leading spreadsheet values are neutralized");
  assert.ok(html.includes('new Blob(["\\uFEFF",csv],{type:"text/csv;charset=utf-8"})'), "CSV uses UTF-8 BOM for spreadsheet compatibility");
  assert.ok(html.includes('setTimeout(()=>URL.revokeObjectURL(url),1000)'), "download URL revocation is deferred");
  assert.ok(html.includes('Exported "+tickets.length+" tickets from the current authorized page.'));
});


test("support admin queue renders a safe, accessible reply thread and composer", () => {
  const html = adminSupportTicketUiHtml;
  assert.ok(html.includes('id="replyThread"'), "conversation thread is present");
  assert.ok(html.includes('id="replyBody"'), "reply composer is present");
  assert.ok(html.includes('id="sendReply"'), "reply action is present");
  assert.ok(html.includes('async function loadReplies(ticketId)'), "thread loads through the protected API");
  assert.ok(html.includes('async function sendReply()'), "reply submission is asynchronous");
  assert.ok(html.includes('"/admin/support/tickets/"+encodeURIComponent(ticketId)+"/replies"'), "ticket ID is encoded in the thread endpoint");
  assert.ok(html.includes('esc(r.body)'), "reply text is HTML-escaped before rendering");
  assert.ok(html.includes('body:JSON.stringify({body})'), "reply text is submitted as JSON");
});
