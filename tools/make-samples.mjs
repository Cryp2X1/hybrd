// Generates synthetic test files (GPX, TCX, FIT) in public/samples. They are made-up workouts for testing the importer.
// Dev-only tool: uses Garmin's FIT SDK (devDependency, Garmin FIT Protocol License) to write the synthetic sample. The app itself parses FIT with fit-file-parser (MIT).
import { Encoder, Profile, Decoder, Stream } from '@garmin/fitsdk';
import { writeFileSync } from 'node:fs';
const OUT = new URL('../public/samples/', import.meta.url).pathname;
const C = [30.2669, -97.7729]; // Zilker Park, Austin TX
const R = 6371000, rad = Math.PI / 180;
// a loop of `len` metres around C, sampled each `step` m
function loop(len, rx = 1, ry = 0.7) {
  const a = len / (Math.PI * (rx + ry)), out = [];
  for (let k = 0; k <= 1; k += 1 / 400) {
    const th = k * 2 * Math.PI;
    const dx = a * rx * Math.cos(th) - a * rx, dy = a * ry * Math.sin(th);
    out.push([C[0] + (dy / R) / rad, C[1] + (dx / (R * Math.cos(C[0] * rad))) / rad]);
  }
  return out;
}
const hav = (p, q) => { const dφ = (q[0] - p[0]) * rad, dλ = (q[1] - p[1]) * rad; const h = Math.sin(dφ / 2) ** 2 + Math.cos(p[0] * rad) * Math.cos(q[0] * rad) * Math.sin(dλ / 2) ** 2; return 2 * R * Math.asin(Math.sqrt(h)); };
// walk along path at speed(t) m/s for durSec, 1 Hz samples
function track(path, durSec, speed, hrf, cadf, altf) {
  const segL = []; let tot = 0; for (let i = 1; i < path.length; i++) { const d = hav(path[i - 1], path[i]); segL.push(d); tot += d; }
  const pts = []; let s = 0;
  for (let t = 0; t <= durSec; t++) {
    s += speed(t);
    let rem = s % tot, i = 0; while (i < segL.length && rem > segL[i]) { rem -= segL[i]; i++; }
    const f = segL[i] ? rem / segL[i] : 0, A = path[i], B = path[i + 1] || path[i];
    pts.push({ t, lat: A[0] + (B[0] - A[0]) * f, lng: A[1] + (B[1] - A[1]) * f, d: s, hr: Math.round(hrf(t)), cad: cadf(t), alt: altf(s) });
  }
  return pts;
}
const iso = (ms) => new Date(ms).toISOString().replace(/\.\d+Z$/, 'Z');
const noise = (t, k = 1) => Math.sin(t / 7) * 1.5 * k + Math.sin(t / 3.1) * k;

// 1) GPX run — 5.0 km easy run, 27:30, HR 128→156, cadence 168 (GPX cad = per-foot 84)
{
  const start = Date.UTC(2026, 10, 7, 13, 10, 0);
  const pts = track(loop(2500), 1650, () => 5000 / 1650, (t) => 128 + 26 * (t / 1650) + noise(t), (t) => 84 + Math.round(noise(t, 0.6)), (d) => 150 + 8 * Math.sin(d / 400));
  const body = pts.map((p) => `      <trkpt lat="${p.lat.toFixed(7)}" lon="${p.lng.toFixed(7)}"><ele>${p.alt.toFixed(1)}</ele><time>${iso(start + p.t * 1000)}</time><extensions><gpxtpx:TrackPointExtension><gpxtpx:hr>${p.hr}</gpxtpx:hr><gpxtpx:cad>${p.cad}</gpxtpx:cad></gpxtpx:TrackPointExtension></extensions></trkpt>`).join('\n');
  writeFileSync(OUT + 'hybrd-sample-run.gpx', `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="HYBRD sample generator (synthetic data)" xmlns="http://www.topografix.com/GPX/1/1" xmlns:gpxtpx="http://www.garmin.com/xmlschemas/TrackPointExtension/v1">
  <metadata><name>HYBRD sample — easy 5 km run</name><time>${iso(start)}</time></metadata>
  <trk><name>Sample easy run</name><type>running</type>
    <trkseg>
${body}
    </trkseg>
  </trk>
</gpx>
`);
}
// 2) TCX interval run — warm-up, 4 × 3 min hard / 2 min easy, cool-down; 6 laps
{
  const start = Date.UTC(2026, 10, 9, 23, 30, 0);
  const plan = [[600, 2.9, 135], ...Array.from({ length: 4 }, () => [[180, 4.3, 172], [120, 2.6, 145]]).flat(), [420, 2.7, 140]];
  const tot = plan.reduce((a, p) => a + p[0], 0);
  const sp = (t) => { let acc = 0; for (const p of plan) { if (t < acc + p[0]) return p[1]; acc += p[0]; } return 2.7; };
  const tgt = (t) => { let acc = 0; for (const p of plan) { if (t < acc + p[0]) return p[2]; acc += p[0]; } return 140; };
  let hr = 110; const hrf = (t) => (hr += (tgt(t) - hr) * 0.04) + noise(t, 0.8);
  const pts = track(loop(1600), tot, sp, hrf, (t) => (sp(t) > 4 ? 88 : 80) + Math.round(noise(t, 0.4)), (d) => 160 + 4 * Math.sin(d / 300));
  let acc = 0; const laps = plan.map((p) => { const ps = pts.filter((x) => x.t >= acc && x.t < acc + p[0]); const lap = { start: acc, sec: p[0], ps }; acc += p[0]; return lap; });
  const lapXml = laps.map((l) => {
    const d = l.ps[l.ps.length - 1].d - l.ps[0].d, hrs = l.ps.map((x) => x.hr);
    return `      <Lap StartTime="${iso(start + l.start * 1000)}">
        <TotalTimeSeconds>${l.sec}</TotalTimeSeconds><DistanceMeters>${d.toFixed(1)}</DistanceMeters><Calories>${Math.round(l.sec * 0.21)}</Calories>
        <AverageHeartRateBpm><Value>${Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length)}</Value></AverageHeartRateBpm><MaximumHeartRateBpm><Value>${Math.max(...hrs)}</Value></MaximumHeartRateBpm>
        <Intensity>${l.sec === 180 ? 'Active' : 'Resting'}</Intensity><TriggerMethod>Manual</TriggerMethod>
        <Track>
${l.ps.filter((_, i) => i % 2 === 0).map((x) => `          <Trackpoint><Time>${iso(start + x.t * 1000)}</Time><Position><LatitudeDegrees>${x.lat.toFixed(7)}</LatitudeDegrees><LongitudeDegrees>${x.lng.toFixed(7)}</LongitudeDegrees></Position><AltitudeMeters>${x.alt.toFixed(1)}</AltitudeMeters><DistanceMeters>${x.d.toFixed(1)}</DistanceMeters><HeartRateBpm><Value>${x.hr}</Value></HeartRateBpm><Extensions><ns3:TPX><ns3:RunCadence>${x.cad}</ns3:RunCadence></ns3:TPX></Extensions></Trackpoint>`).join('\n')}
        </Track>
      </Lap>`;
  }).join('\n');
  writeFileSync(OUT + 'hybrd-sample-intervals.tcx', `<?xml version="1.0" encoding="UTF-8"?>
<TrainingCenterDatabase xmlns="http://www.garmin.com/xmlschemas/TrainingCenterDatabase/v2" xmlns:ns3="http://www.garmin.com/xmlschemas/ActivityExtension/v2">
  <Activities>
    <Activity Sport="Running">
      <Id>${iso(start)}</Id>
${lapXml}
      <Notes>HYBRD sample — 4 x 3 min intervals (synthetic data)</Notes>
      <Creator xsi:type="Device_t" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><Name>HYBRD sample generator</Name></Creator>
    </Activity>
  </Activities>
</TrainingCenterDatabase>
`);
}
// 3) FIT ride — 20 km, ~45 min, HR, cadence (rpm), 2 laps, session calories
{
  const start = Date.UTC(2026, 10, 11, 12, 0, 0);
  const dur = 2700;
  const pts = track(loop(5000, 1.2, 0.8), dur, (t) => 7.4 + Math.sin(t / 120) * 0.6, (t) => 138 + 10 * Math.sin(t / 400) + noise(t), (t) => 86 + Math.round(noise(t, 1)), (d) => 155 + 10 * Math.sin(d / 900));
  const S = 2 ** 31 / 180;
  const enc = new Encoder();
  const M = Profile.MesgNum;
  enc.onMesg(M.FILE_ID, { type: 'activity', manufacturer: 'development', product: 0, serialNumber: 1234, timeCreated: new Date(start), productName: 'HYBRD sample generator' });
  enc.onMesg(M.EVENT, { timestamp: new Date(start), event: 'timer', eventType: 'start' });
  for (const p of pts) enc.onMesg(M.RECORD, { timestamp: new Date(start + p.t * 1000), positionLat: Math.round(p.lat * S), positionLong: Math.round(p.lng * S), distance: p.d, enhancedAltitude: p.alt, heartRate: p.hr, cadence: p.cad, enhancedSpeed: 7.4 });
  const end = new Date(start + dur * 1000);
  enc.onMesg(M.EVENT, { timestamp: end, event: 'timer', eventType: 'stopAll' });
  const half = Math.floor(pts.length / 2);
  const lapOf = (a, b, i) => { const ps = pts.slice(a, b); const hrs = ps.map((x) => x.hr); return { messageIndex: i, timestamp: new Date(start + ps[ps.length - 1].t * 1000), startTime: new Date(start + ps[0].t * 1000), totalElapsedTime: ps[ps.length - 1].t - ps[0].t, totalTimerTime: ps[ps.length - 1].t - ps[0].t, totalDistance: ps[ps.length - 1].d - ps[0].d, avgHeartRate: Math.round(hrs.reduce((x, y) => x + y, 0) / hrs.length), maxHeartRate: Math.max(...hrs), sport: 'cycling', event: 'lap', eventType: 'stop' }; };
  enc.onMesg(M.LAP, lapOf(0, half, 0));
  enc.onMesg(M.LAP, lapOf(half, pts.length, 1));
  const hrs = pts.map((x) => x.hr);
  enc.onMesg(M.SESSION, { messageIndex: 0, timestamp: end, startTime: new Date(start), totalElapsedTime: dur, totalTimerTime: dur, totalDistance: pts[pts.length - 1].d, totalAscent: 74, totalCalories: 612, avgHeartRate: Math.round(hrs.reduce((a, b) => a + b, 0) / hrs.length), maxHeartRate: Math.max(...hrs), avgCadence: 86, sport: 'cycling', subSport: 'road', firstLapIndex: 0, numLaps: 2, event: 'session', eventType: 'stop' });
  enc.onMesg(M.ACTIVITY, { timestamp: end, totalTimerTime: dur, numSessions: 1, type: 'manual', event: 'activity', eventType: 'stop', localTimestamp: Math.round(end.getTime() / 1000 - 631065600 - 6 * 3600) });
  const bytes = enc.close();
  writeFileSync(OUT + 'hybrd-sample-ride.fit', bytes);
  const d = new Decoder(Stream.fromByteArray(bytes));
  console.log('FIT integrity', d.checkIntegrity());
  const { messages, errors } = new Decoder(Stream.fromByteArray(bytes)).read();
  console.log('FIT', errors.length ? errors : 'ok', messages.recordMesgs.length, 'records', JSON.stringify({ ...messages.sessionMesgs[0] }).slice(0, 300), messages.fileIdMesgs[0]);
}
console.log('samples written to', OUT);
