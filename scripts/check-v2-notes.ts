import { coerceV2NoteSchema, prepareCommentWrite } from "../src/lib/v2NoteSchema";

const notes = [
  "spoke w mike @ acme. likes it but needs to check w ops. call me thurs after 3. 7205550199",
  "vm left for jen. budget froze till april. ping friday 11ish if she doesn't text back. 303 555 8821",
  "met dan in parking lot lol not ready. ask in 2 wks. use cell 8015551212 not office",
  "sara / bluepeak - gatekeeper said call back after 4:30, owner traveling, maybe monday. 9705554433",
  "tony no answer x2. texted 'call tomorrow'. think his number is 602-555-1009. wants 2 trucks maybe",
];

const results = notes.map((raw_note) => {
  const note = coerceV2NoteSchema({ raw_note });
  const prepared = prepareCommentWrite(note);

  return {
    raw_note,
    note_type: note.note_type,
    summary: note.summary,
    callback_time: note.callback_time,
    phone: note.phone,
    missing_fields: note.missing_fields,
    ok: prepared.ok,
  };
});

console.log(JSON.stringify(results, null, 2));
