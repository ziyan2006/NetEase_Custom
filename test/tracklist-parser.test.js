import test from "node:test";
import assert from "node:assert/strict";
import {
  isUnreleasedTrack,
  cleanTracklistLine,
  parseSingleTrack,
  parseTracklistText,
  parse1001TracklistHtml,
} from "../lib/dj-agent/tracklist-parser.js";

test("Tracklist Parser: Unreleased Track Detection", () => {
  assert.equal(isUnreleasedTrack("ID", "ID"), true);
  assert.equal(isUnreleasedTrack("Martin Garrix", "ID"), true);
  assert.equal(isUnreleasedTrack("ID", "Track Name (Original Mix)"), true);
  assert.equal(isUnreleasedTrack("Artist", "Unknown Track"), true);
  assert.equal(isUnreleasedTrack("Tiësto", "The Business"), false);
  assert.equal(isUnreleasedTrack("Anyma", "Syren (Extended Mix)"), false);
});

test("Tracklist Parser: Line Cleaning (Timestamps, Numbers, Labels)", () => {
  const line1 = "01. [00:00] Martin Garrix & Brooks - Byte [STMPD RCRDS]";
  const cleaned1 = cleanTracklistLine(line1);
  assert.equal(cleaned1.timestamp, "00:00");
  assert.equal(cleaned1.label, "STMPD RCRDS");
  assert.equal(cleaned1.cleanLine, "Martin Garrix & Brooks - Byte");

  const line2 = "[12:35] Fisher - Losing It [CATCH & RELEASE]";
  const cleaned2 = cleanTracklistLine(line2);
  assert.equal(cleaned2.timestamp, "12:35");
  assert.equal(cleaned2.cleanLine, "Fisher - Losing It");
});

test("Tracklist Parser: Single Track & Mashup Parsing", () => {
  // 1. Standard Track with Remix
  const single = parseSingleTrack("Tiësto - The Business (220 KID Remix)");
  assert.equal(single.length, 1);
  assert.equal(single[0].artist, "Tiësto");
  assert.equal(single[0].title, "The Business (220 KID Remix)");
  assert.equal(single[0].remix, "220 KID Remix");
  assert.equal(single[0].searchQuery, "Tiësto The Business 220 KID Remix");

  // 2. Mashup splitting
  const mashup = parseSingleTrack("Fisher - Losing It vs. Acraze - Do It To It (VIP Edit)");
  assert.equal(mashup.length, 2);
  assert.equal(mashup[0].artist, "Fisher");
  assert.equal(mashup[0].title, "Losing It");
  assert.equal(mashup[1].artist, "Acraze");
  assert.equal(mashup[1].title, "Do It To It (VIP Edit)");
  assert.equal(mashup[1].remix, "VIP Edit");
});

test("Tracklist Parser: Full Multi-line Text Setlist with ID Filtering", () => {
  const sampleSet = `
# Martin Garrix @ Tomorrowland 2026
01. [00:00] Martin Garrix & Sentinel - Hurricane [STMPD]
02. [03:45] ID - ID [WHITE LABEL]
03. [05:10] Alesso - Words (VIP Mix)
04. [08:30] David Guetta & MORTEN - ID
05. [11:20] Fred again.. & Swedish House Mafia - Turn On The Lights again..
  `;

  const parsed = parseTracklistText(sampleSet, { filterUnreleased: true });
  assert.equal(parsed.totalCount, 5);
  assert.equal(parsed.filteredCount, 2); // ID - ID and David Guetta - ID filtered
  assert.equal(parsed.tracks.length, 3);

  assert.equal(parsed.tracks[0].trackNumber, 1);
  assert.equal(parsed.tracks[0].artist, "Martin Garrix & Sentinel");
  assert.equal(parsed.tracks[0].title, "Hurricane");

  assert.equal(parsed.tracks[1].trackNumber, 2);
  assert.equal(parsed.tracks[1].artist, "Alesso");
  assert.equal(parsed.tracks[1].remix, "VIP Mix");

  assert.equal(parsed.tracks[2].trackNumber, 3);
  assert.equal(parsed.tracks[2].artist, "Fred again.. & Swedish House Mafia");
});

test("Tracklist Parser: HTML Parsing (Schema.org / DOM Fallback)", () => {
  const mockHtml = `
    <html>
      <head><title>Anyma @ Afterlife Tulum 2026 Tracklist | 1001Tracklists</title></head>
      <body>
        <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "MusicPlaylist",
          "itemListElement": [
            { "name": "Syren (Extended Mix)", "byArtist": { "name": "Anyma & Rebūke" } },
            { "name": "ID", "byArtist": { "name": "ID" } },
            { "name": "Eternity", "byArtist": { "name": "Anyma & Chris Avantgarde" } }
          ]
        }
        </script>
      </body>
    </html>
  `;

  const parsed = parse1001TracklistHtml(mockHtml, { filterUnreleased: true });
  assert.equal(parsed.title, "Anyma @ Afterlife Tulum 2026");
  assert.equal(parsed.tracks.length, 2);
  assert.equal(parsed.filteredCount, 1);
  assert.equal(parsed.tracks[0].artist, "Anyma & Rebūke");
  assert.equal(parsed.tracks[0].title, "Syren (Extended Mix)");
  assert.equal(parsed.tracks[1].artist, "Anyma & Chris Avantgarde");
});
