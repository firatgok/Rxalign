// Arka plan servisi: ağız içi fotoğrafların yönünü ve portre seçimini Claude'a sorar,
// kayıtlı formları Firestore'dan okur. Kaynak dosya budur;
// eklenti background.bundle.js'i yükler (npm run build).
import Anthropic from "@anthropic-ai/sdk";
import { FIREBASE_API_KEY, FIREBASE_PROJECT_ID } from "./firebase-config.js";

const MODEL = "claude-opus-5-5";
// Kırpma kutuları için kullanıcı seçimi (fiyat/performans): Sonnet 5.5.
const CROP_MODEL = "claude-sonnet-5-5";

const SIDES = ["top", "bottom", "left", "right", "none"];

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          slot: { type: "string" },
          is_photo: { type: "boolean" },
          upper_jaw_side: { type: "string", enum: SIDES },
          incisors_side: { type: "string", enum: SIDES },
          arch: { type: "string", enum: ["upper", "lower", "none"] },
          note: { type: "string" },
        },
        required: ["slot", "is_photo", "upper_jaw_side", "incisors_side", "arch", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const SYSTEM = `You read the orientation of intraoral orthodontic photographs that have already been sorted into the photo slots of the Invisalign Doctor Site. Each image is labelled with its slot: occlussal_upper and occlussal_lower are views onto the biting surfaces of one arch, usually taken through a mirror; labial_anterior is the front view of both arches with retractors; buccal_right and buccal_left are side views of the posterior teeth from the cheek.

The photos come straight from the camera and may be upside down or rotated by any multiple of 90 degrees, so a side view can show the tooth rows running vertically. The software rotates and mirrors them afterwards based on your answer. Describe each image exactly as it appears in the pixels you are given and do not mentally correct anything.

Return one entry per image, repeating its slot label.

is_photo: true for a real clinical photograph. false for a 3D scan rendering (teeth and gums floating on a plain background) or anything that is not a photograph of this view; the software leaves those untouched.

upper_jaw_side (labial_anterior and buccal slots, otherwise "none"): the side of the picture - top, bottom, left or right - where the upper (maxillary) teeth are, as opposed to the lower teeth. Clues: the upper central incisors are clearly wider than the lower incisors; the upper front teeth overlap the lower ones from outside; nostrils or the base of the nose lie on the upper side, the chin on the lower side. Use "none" only if you cannot tell.

incisors_side (occlusal and buccal slots, otherwise "none"): the side of the picture - top, bottom, left or right - where the incisors are. For an occlusal view this is the closed front end of the arch; for a buccal view it is the end of the tooth row where the front teeth are. Use "none" only if you cannot tell.

arch (occlussal slots only, otherwise "none"): which arch the picture actually shows, judged from the pixels because the slot label may be wrong: "upper" when the hard palate (pinkish, with transverse ridges) fills the middle of the U-shaped arch whose biting surfaces fill the picture, "lower" when the tongue or the floor of the mouth does. If teeth of the opposing arch also show as a strip along one edge, ignore them. Use "none" only if you cannot tell.

note: one short remark in Turkish only when the photo looks unusable for this slot (wrong view, badly blurred, very dark, blocked by a retractor or finger); otherwise an empty string.`;

const PORTRAIT_SCHEMA = {
  type: "object",
  properties: {
    index: { type: "integer" },
    smiling: { type: "boolean" },
  },
  required: ["index", "smiling"],
  additionalProperties: false,
};

const PORTRAIT_SYSTEM = `You are given the upright photos from one orthodontic patient's folder, each labelled with an index. Most are extraoral face photos; some may be intraoral shots that happen to be rotated. Pick the one photo to use as the patient's portrait.

Choose the extraoral photo that shows the whole face from the front with the patient smiling. If several qualify, prefer the one that is sharp, well framed, and has open eyes. If no frontal photo shows a smile, choose the frontal face photo at rest instead and set smiling to false. Profile and three-quarter views do not qualify.

Return the index printed before the chosen image. If there is no frontal face photo at all, return index -1 and smiling false.`;

// Anahtar yalnızca bu bilgisayardaki eklenti deposunda durur; istek doğrudan
// eklentinin arka plan servisinden çıkar, IDS sayfası anahtarı göremez.
// Çağrı istatistikleri (hızlandırma ölçümü): içerik betiği "ids-stats" ile alır ve boşaltır.
const STATS = [];
function pushStat(s) { STATS.push(s); if (STATS.length > 500) STATS.splice(0, STATS.length - 500); }

async function askClaude({ system, content, schema, effort, model, tag }) {
  const { anthropicApiKey } = await chrome.storage.local.get("anthropicApiKey");
  if (!anthropicApiKey) {
    throw new Error("API anahtarı girilmemiş. Eklenti simgesine tıklayıp ayarlardan ekleyin.");
  }
  const client = new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true });

  const t0 = Date.now();
  const kind = tag || String(system || "").split(" ").slice(0, 5).join(" ");
  let response, rawResponse;
  try {
    const got = await client.beta.messages.create({
    model: model || MODEL,
    max_tokens: 16000,
    betas: ["server-side-fallback-2026-07-01"],
    fallbacks: "default",
    system,
    output_config: { effort, format: { type: "json_schema", schema } },
    messages: [{ role: "user", content }],
    }).withResponse();
    response = got.data; rawResponse = got.response;
  } catch (error) {
    pushStat({ kind, model: model || MODEL, ms: Date.now() - t0, err: String(error && error.message || error).slice(0, 80) });
    throw error;
  }
  const h = rawResponse && rawResponse.headers;
  pushStat({ kind, model: model || MODEL, ms: Date.now() - t0, inTok: response.usage && response.usage.input_tokens, outTok: response.usage && response.usage.output_tokens,
    reqLeft: h && h.get("anthropic-ratelimit-requests-remaining"), tokLeft: h && h.get("anthropic-ratelimit-input-tokens-remaining"), outLeft: h && h.get("anthropic-ratelimit-output-tokens-remaining") });

  if (response.stop_reason === "refusal") {
    throw new Error("Model bu fotoğraflara bakmayı reddetti.");
  }
  if (response.stop_reason === "max_tokens") {
    throw new Error("Yanıt yarıda kesildi; yeniden deneyin.");
  }
  const text = response.content.find((block) => block.type === "text");
  if (!text) throw new Error("Modelden yanıt alınamadı.");
  return JSON.parse(text.text);
}

async function orient(images) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Slot ${img.slot}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: img.media_type, data: img.data },
    });
  }
  content.push({ type: "text", text: `Report the orientation of all ${images.length} images.` });
  const result = await askClaude({ system: SYSTEM, content, schema: SCHEMA, effort: "high" });
  return result.items;
}

// İçerik betiğinden gelen effort değeri yalnız bilinen değerlerden biri olabilir.
function pickEffort(value, fallback) {
  return value === "low" || value === "medium" || value === "high" ? value : fallback;
}


// Oklüzal kareler: yalnızca diş sırasının kutusu (ve yön bilgisi). Geniş kırpma isteminden ayrı, tek işli bir okuma;
// uzaktan çekilmiş karelerde (yüz, eldiven, ekartör görünür) diş sırası küçük kalır ve sıkı kırpma buna bağlıdır.
const ARCH_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          is_occlusal: { type: "boolean" },
          arch: { type: "string", enum: ["upper", "lower", "none"] },
          teeth_left: { type: "number" },
          teeth_right: { type: "number" },
          teeth_top: { type: "number" },
          teeth_bottom: { type: "number" },
          incisors_side: { type: "string", enum: SIDES },
          direct_teeth_side: { type: "string", enum: SIDES },
          direct_teeth_edge: { type: "number" },
          incisor_x: { type: "number" },
          incisor_y: { type: "number" },
          molar_mid_x: { type: "number" },
          molar_mid_y: { type: "number" },
        },
        required: ["index", "is_occlusal", "arch", "teeth_left", "teeth_right", "teeth_top", "teeth_bottom", "incisors_side", "direct_teeth_side", "direct_teeth_edge", "incisor_x", "incisor_y", "molar_mid_x", "molar_mid_y"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const ARCH_SYSTEM = `You measure occlusal photographs of one dental arch (usually taken through an intraoral mirror), each labelled with an index. The photos may be taken from a distance, so the face, chin, lips, cheeks, gloved hands, the cheek retractor, the mirror frame and instruments can fill much of the picture while the teeth occupy only a part of it. Look only at the teeth.

Return one entry per image, repeating its index.

is_occlusal: true only when the picture shows ONE dental arch seen from its biting-surface side (normally through a mirror: the palate or the tongue is visible behind the teeth and the opposing arch is NOT visible in the mirror; teeth seen directly outside the mirror, described below, do not change this). false for a frontal or side view of the teeth where upper and lower teeth meet (even if the photo is held sideways or upside down), for face photos and for anything else. The software relies on this answer, so be strict.

teeth_left, teeth_right, teeth_top, teeth_bottom: the bounding box of ALL visible tooth crowns of the arch (enamel only), as fractions of the image exactly as shown (0..1, x to the right, y downward; do not rotate or mirror anything): the x of the leftmost and of the rightmost tooth, the y of the highest and of the lowest point of any tooth. The box must include the incisors at the front and the last visible molars on both sides. It must not include the palate or tongue, the gums beyond the teeth, the lips, the face, the mirror frame, the retractor, gloves or instruments, so it is normally much smaller than the whole picture. It must also not include teeth seen directly (see below).

In a mirror photo the camera often also sees some real teeth DIRECTLY, not in the mirror: usually the front teeth of the other arch (and sometimes of the same arch), as a strip or row of tooth edges along one edge of the picture, beyond the edge of the mirror, next to the open molar end of the mirrored arch. They are not part of the arch you measure: they lie outside the mirror, they are seen from the front or from the incisal edge instead of from the biting surface, they are usually larger or blurred, and there is often lip, mirror rim or dark space between them and the arch. Look carefully along the picture edge beyond the open molar end of the arch: the strip may be narrow, only the incisal edges may show, and it may be partly covered by the mirror handle, a retractor or another instrument; it still counts. They are very common in mirror photos, so check for them every time.
direct_teeth_side: the side of the picture - top, bottom, left or right - where such directly seen teeth are; "none" when there are none.
direct_teeth_edge: the coordinate of the edge of those directly seen teeth that is nearest to the measured arch, as a fraction of the image exactly as shown: a y for top or bottom, an x for left or right. 0 when direct_teeth_side is "none". A crop ending there keeps them out of the picture.

incisor_x, incisor_y: the point in the middle of the front of the measured arch, where the two central incisors touch each other (on their biting edges), as fractions of the image exactly as shown.
molar_mid_x, molar_mid_y: the midpoint between the last visible molar on the left side of the arch and the last visible molar on the right side (the middle of the line joining the back ends of the two tooth rows). The line from the incisor point to this point is the arch's axis of symmetry; the software rotates the picture slightly so that it stands straight. Give 0 for all four when you cannot tell.

arch: "upper" when the picture shows the upper (maxillary) arch (palate, rugae behind the front teeth), "lower" for the lower (mandibular) arch (tongue, floor of the mouth), "none" if you cannot tell.

incisors_side: the side of the picture - top, bottom, left or right - where the front teeth (incisors) are, i.e. the closed front end of the arch as opposed to the molars. Use "none" only if you cannot tell.`;

// Üst/alt oklüzal: iki kare birlikte gösterilir, hangisi üst çene sorulur. Mutlak çene okuması aynanın bastırdığı dilli alt karede
// "damak" diyordu (Esma Ulusoy 0170, Budak 9320; 6 Kasım 2026); karşılaştırma daha güvenilir (A/B dik okumasındaki gibi).
const ARCH_PAIR_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", description: "One short sentence naming the clues (palate ridges, tongue, floor of mouth, incisor width)" },
    upper: { type: "string", enum: ["A", "B", "unsure"], description: "Which photo shows the UPPER (maxillary) arch" },
  },
  required: ["reason", "upper"],
  additionalProperties: false,
};

const ARCH_PAIR_SYSTEM = `You see two occlusal photographs (biting surfaces, usually taken in a mirror) of the SAME orthodontic patient, A and B. One shows the UPPER arch and the other the LOWER arch. They may be rotated or upside down; ignore any strip of opposing teeth along an edge.

UPPER (maxillary) arch: behind the teeth lies the hard palate, a dome with transverse ridges (rugae) near the front teeth and a midline raphe; no tongue; the central incisors are the widest front teeth.
LOWER (mandibular) arch: behind the teeth lies the tongue or the floor of the mouth (smooth, glossy, with the lingual frenum and sometimes the mirror pressing the tongue flat so it looks smooth and pink); the lower front teeth are narrow and small; the arch is usually smaller and more U-shaped.

Strong clues:
- The strip of OPPOSING teeth seen directly along one edge belongs to the other arch. Compare the central incisors in the mirror with the central incisors in that direct strip: the arch whose central incisors are clearly WIDER is the upper arch. So if the mirror arch has small narrow front teeth and the direct strip shows wide front teeth (often with the upper lip), the mirror shows the LOWER arch.
- A midline vertical fold (lingual frenum) joining the tongue to a wet, glossy, dark red floor means LOWER, even when the mirror presses the tongue flat and the floor looks smooth. A matte, lighter pink dome with transverse ridges just behind the front teeth means UPPER.
- The lower arch is smaller and narrower; the upper arch is wider with larger molars.
Compare the pictures against each other rather than judging each alone. Answer which photo (A or B) is the upper arch; "unsure" only if they look like the same arch.`;

// Birden çok oklüzal kare birlikte: her biri üst mü alt mı (birbirine göre). İkili karşılaştırma iki üst kareyi karşılaştırınca
// "unsure" kalıyordu; küme halinde sorulunca aynı çenenin tekrarları birlikte ayrılır.
const ARCH_SET_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", description: "One short sentence on the clues that separate the two arches in this set" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          arch: { type: "string", enum: ["upper", "lower", "unsure"] },
        },
        required: ["index", "arch"],
        additionalProperties: false,
      },
    },
  },
  required: ["reason", "items"],
  additionalProperties: false,
};

// Ön ağız içi kareler birlikte: hangileri kapanışta (dişler temasta), hangileri ağız açık. Tek kare okuması aralığı küçük olan
// açık kareyi "kapanış" sayabiliyordu (Eray Çakır 0082, 7 Kasım 2026); karşılaştırmalı okuma daha güvenilir.
const BITE_SET_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", description: "One short sentence on the clues that separate the closed and the open photos in this set" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          bite: { type: "string", enum: ["closed", "open", "unsure"] },
        },
        required: ["index", "bite"],
        additionalProperties: false,
      },
    },
  },
  required: ["reason", "items"],
  additionalProperties: false,
};

const BITE_SET_SYSTEM = `You see several frontal intraoral photographs of the SAME orthodontic patient, taken with cheek retractors, each with an index. They may be upside down or sideways; that does not matter.

CLOSED bite (teeth together, in occlusion): the upper and the lower tooth rows touch each other; the upper incisors overlap the lower incisors and hide part of them (or, with an anterior open bite, at least the back teeth on both sides are in contact); the cusps of the premolars and molars interlock; there is NO continuous dark space running between the upper and the lower teeth.
OPEN (jaws apart): a dark gap separates the upper tooth row from the lower one along its whole length, from one side to the other, however narrow that gap is; the biting edges of both the upper and the lower incisors are fully visible with the gap between them; the mouth cavity shows between the rows.

Compare the photos with each other: in the same patient the closed photos show the rows touching and the open photos show the gap. Even a gap of only a millimetre or two means open. Judge every photo; "unsure" only if the teeth cannot be seen.`;

async function readBiteSet(images, effort, modelName) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: `For each of these ${images.length} photos say whether the bite is closed (teeth together) or open (jaws apart).` });
  const result = await askClaude({ system: BITE_SET_SYSTEM, content, schema: BITE_SET_SCHEMA, effort: pickEffort(effort, "medium"), model: modelName === "opus" ? MODEL : CROP_MODEL });
  return result.items || [];
}

// Bukkal (yan) kareler birlikte: hangileri baş aşağı çekilmiş, hangisi sağ/sol. Tek kare A/B okuması aynı hastanın üç bukkalini de
// "dik, kesiciler sağda" okuyabiliyor (Enes Salar 1546, 7 Kasım 2026: sol bukkal 180° çevrilmiş çekilmiş); karşılaştırmalı okuma
// üst çenenin altta kaldığı kareyi ayırır.
const BUCCAL_SET_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", description: "One short sentence on the clues (upper jaw position, gingiva, tooth size, facial hair) that separate the photos" },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          upside_down: { type: "boolean", description: "true when the UPPER jaw is at the BOTTOM of the picture as shown" },
          side: { type: "string", enum: ["right", "left", "unsure"], description: "The patient's side this photo shows, after correcting for an upside-down photo" },
        },
        required: ["index", "upside_down", "side"],
        additionalProperties: false,
      },
    },
  },
  required: ["reason", "items"],
  additionalProperties: false,
};

const BUCCAL_SET_SYSTEM = `You see several buccal (side) intraoral photographs of the SAME orthodontic patient, taken with cheek retractors, each with an index. The clinic photographs one side with the camera held normally and the other side with the camera turned by 180 degrees, so some photos may be upside down. Decide for every photo whether it is upside down and which side of the patient it shows.

Step 1, is the photo upside down? Find the UPPER jaw: its teeth are larger (the upper canine is the long pointed tooth, the upper central incisors are the widest), the upper teeth overlap the lower ones from the outside and hide their biting edges, and above the upper teeth lies the upper vestibule and gingiva, the upper lip and sometimes nostrils or a moustache. The LOWER teeth are smaller and narrower, and below them lie the lower lip, chin and sometimes a beard. In an upright photo the upper jaw is at the TOP; if the upper jaw is at the BOTTOM the photo is upside down. Compare the photos with each other: they are of the same mouth, so the row of larger teeth with the longer canine is the same upper jaw in all of them; photos that look like one another but have that row at opposite edges differ by a 180-degree turn.

Step 2, which side? Imagine the photo upright (turn an upside-down photo by 180 degrees in your mind, which also swaps left and right). In an upright photo of the patient's RIGHT side the front teeth (incisors) are on the RIGHT edge of the picture and the molars on the left; on the patient's LEFT side the incisors are on the LEFT and the molars on the right. So in a photo as shown with the incisors on the right: upright means the right side, upside down means the LEFT side.

Give for every photo upside_down and side; "unsure" only if the teeth cannot be seen.`;

async function readBuccalSet(images, effort, modelName) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: `For each of these ${images.length} photos say whether it is upside down and which side of the patient it shows.` });
  const result = await askClaude({ system: BUCCAL_SET_SYSTEM, content, schema: BUCCAL_SET_SCHEMA, effort: pickEffort(effort, "medium"), model: modelName === "opus" ? MODEL : CROP_MODEL });
  return result.items || [];
}

async function readArchSet(images, effort, modelName) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: `These ${images.length} occlusal photos are of the same patient; usually both arches are present and each arch may be repeated. Compare them with each other and say for every photo whether it shows the upper or the lower arch.` });
  const result = await askClaude({ system: ARCH_PAIR_SYSTEM, content, schema: ARCH_SET_SCHEMA, effort: pickEffort(effort, "medium"), model: modelName === "opus" ? MODEL : CROP_MODEL });
  return result.items || [];
}

async function readArchPair(a, b, effort, modelName) {
  const content = [
    { type: "text", text: "Photo A:" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a } },
    { type: "text", text: "Photo B:" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b } },
    { type: "text", text: "Which photo shows the upper arch?" },
  ];
  return askClaude({ system: ARCH_PAIR_SYSTEM, content, schema: ARCH_PAIR_SCHEMA, effort: pickEffort(effort, "medium"), model: modelName === "opus" ? MODEL : CROP_MODEL });
}

async function readArch(images, effort, modelName) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: `Measure the dental arch in all ${images.length} photos.` });
  const result = await askClaude({ system: ARCH_SYSTEM, content, schema: ARCH_SCHEMA, effort: pickEffort(effort, "high"), model: modelName === "sonnet" ? CROP_MODEL : MODEL });
  return result.items;
}

// Yön okuması (kırpma sırasında): tek fotoğraf, birbirini doğrulayan sorular. Fotoğraf kameradan geldiği gibidir; döndürülmüş ya da baş aşağı
// olabilir. Alanlar bağımsız yanıtlanır, yazılım tutarlılığı (ön diş ve azı dişi karşı uçlarda mı, üst çene dişlerin sırasına dik mi) denetler.
const POSE_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          view: { type: "string", enum: ["frontal", "buccal", "occlusal", "other"] },
          upper_jaw_side: { type: "string", enum: SIDES },
          incisors_side: { type: "string", enum: SIDES },
          molars_side: { type: "string", enum: SIDES },
          arch: { type: "string", enum: ["upper", "lower", "none"] },
          behind_teeth: { type: "string", enum: ["palate", "tongue", "unclear", "none"] },
          complete_arch: { type: "boolean", description: "Occlusal view: the whole arch (incisors and the last molars on both sides) is in the picture; true for other views" },
        },
        required: ["index", "view", "upper_jaw_side", "incisors_side", "molars_side", "arch", "behind_teeth", "complete_arch"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const POSE_SYSTEM = `You read the orientation of an intraoral orthodontic photograph exactly as it appears in the pixels you are given. The photo comes straight from the camera: it may be upside down or rotated by any multiple of 90 degrees, and occlusal views are usually taken through a mirror. Do not correct or rotate anything mentally. Answer every field independently from what you see; do not derive one answer from another.

Return one entry per image, repeating its index.

view: "frontal" = front view of both arches meeting (upper and lower front teeth together, normally with cheek retractors); "buccal" = side view of the tooth rows seen from the cheek, a row of teeth running from the small flat front teeth at one end to the large molars at the other; "occlusal" = ONE arch seen from its biting surfaces, usually through a mirror, with the palate or the tongue behind the teeth and the opposing arch not visible; "other" = anything else (face photos, scans, non-clinical).

upper_jaw_side (frontal and buccal views, otherwise "none"): the side of the picture (top, bottom, left or right) where the UPPER teeth are, as opposed to the lower teeth. Clues: the upper teeth overlap the lower ones from outside, upper central incisors are wider than the lower ones, the nose and upper lip lie on the upper side and the chin and lower lip on the lower side. Use "none" only if you cannot tell.

incisors_side (buccal and occlusal views, otherwise "none"): the side of the picture where the front teeth (incisors) are. Buccal: the end of the visible tooth row that has the small flat front teeth, the other end has the big molars. Occlusal: the closed, rounded front end of the U-shaped arch, where the incisors form the curve. Use "none" only if you cannot tell.

OCCLUSAL VIEWS: the arch of interest is the one whose biting (chewing) surfaces fill the middle of the picture. If teeth of the OPPOSING arch are also visible, usually as a strip of front teeth along one edge of the picture, they are NOT the arch of interest: ignore them completely for incisors_side, molars_side, behind_teeth and arch. Upper front teeth are wide and flat, lower front teeth are narrow.

molars_side (buccal and occlusal views, otherwise "none"): the side of the picture where the last molars are. Buccal: the end of the tooth row with the big molars. Occlusal: the side toward which the U-shaped arch opens, where the molars continue backwards. Decide this separately from incisors_side.

behind_teeth (occlusal view only, otherwise "none"): what fills the middle of the U-shaped arch of interest: "palate" (the hard palate, pinkish with transverse ridges), "tongue" (the tongue or floor of the mouth), or "unclear". Answer from what you see, independently of arch.
complete_arch (occlusal view only, otherwise true): true when the WHOLE arch of interest is in the picture, the incisors at the front and the last molars on BOTH sides, so the full U shape is visible; false when only part of the arch is shown (one side or one quadrant, a close-up of a few teeth) or when the arch is cut off by the edge of the picture.

arch (occlusal view only, otherwise "none"): "upper" for the upper (maxillary) arch of interest (palate behind its teeth), "lower" for the lower (mandibular) arch of interest (tongue or floor of the mouth behind its teeth). Use "none" only if you cannot tell.`;

// Ham ön/bukkal kare dik mi, baş aşağı mı: aynı karenin iki hali (B = A'nın 180° döndürülmüşü) birlikte gösterilir, dik olan sorulur.
const UPRIGHT_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", description: "One short sentence naming the clues you saw (nose, chin, lips, teeth)" },
    face_cue: { type: "string", enum: ["A", "B", "none"], description: "Which version is upright judging ONLY from face anatomy (nose/nostrils, chin, neck, lips); none if no such anatomy is visible" },
    teeth_cue: { type: "string", enum: ["A", "B", "unsure"], description: "Which version is upright judging ONLY from the teeth" },
    upright: { type: "string", enum: ["A", "B", "unsure"], description: "Final answer; face anatomy wins over teeth when both are visible" },
    incisors_side_upright: { type: "string", enum: ["left", "right", "none"], description: "Buccal (side) view only: in the UPRIGHT version, which side of the picture the front teeth (incisors) are on; none for a frontal view" },
    bite: { type: "string", enum: ["closed", "open", "none"], description: "closed when the upper and lower teeth touch each other (teeth together, in occlusion); open when the jaws are apart so there is a visible gap between the upper and the lower teeth; none if it cannot be told" },
  },
  required: ["reason", "face_cue", "teeth_cue", "upright", "incisors_side_upright", "bite"],
  additionalProperties: false,
};

const UPRIGHT_SYSTEM = `You compare two versions of the same intraoral orthodontic photograph: a frontal view of both arches together, or a buccal (side) view of the tooth rows, taken with cheek retractors. Version B is version A rotated by 180 degrees. Exactly one of them is upright, meaning the patient's head is the normal way up: the UPPER jaw, nose and upper lip at the TOP, the lower jaw, chin and neck at the BOTTOM. Decide which version is upright.

FACE ANATOMY (most reliable, use it whenever any of it is visible, even partially at the edge of the picture): the nose or nostrils are ABOVE the mouth; the chin, the jawline and the neck are BELOW the mouth; the upper lip is thinner and has a philtrum (two vertical ridges under the nose) and a cupid's bow, the lower lip is fuller and rounder; a moustache sits above the mouth, a beard or chin stubble below it; the cheeks widen towards the top (cheekbones) in a frontal view. Report this in face_cue; "none" only if no skin, lips, nose or chin can be seen.

TEETH (secondary): the upper central incisors are the widest and longest front teeth and they overlap the lower front teeth from the outside, hiding the biting edges of the lower incisors; lower incisors are narrow and small. The upper canines are long and pointed. In a buccal view the upper tooth row usually overhangs the lower one. Report this in teeth_cue.

First write one short sentence with the clues you used, then fill face_cue and teeth_cue, then the final answer: face_cue when it is not "none", otherwise teeth_cue. Lips and retractors by themselves are symmetric; the nose and chin are not.

Finally, for a buccal (side) view only: looking at the version you chose as upright, report on which side of the picture the front teeth (incisors, the small flat teeth at one end of the row) are, left or right; the big molars are at the other end. For a frontal view answer "none".

Also report the bite, for both frontal and side views: "closed" when the upper and lower teeth are biting together, touching each other along the tooth rows (in occlusion), even if the front teeth do not meet because of an overbite or an open bite at the front; "open" when the patient's jaws are apart, so that a dark gap separates the upper tooth row from the lower one along its whole length; "none" if you cannot tell.`;

// Yüz yuvaları için seçim: aynı hastanın yüz kareleri birlikte gösterilir, her yuva için en uygun karenin indeksi istenir (yakın plan ve
// üç çeyrek kareler elenir; doğrudan yerleştirmede etiket tek başına yetmiyordu: Satoğlu'nda gülümseme yakın planı, Balaban'da üç çeyrek
// kare seçilmişti, 6 Kasım 2026).
const FACE_PICK_SCHEMA = {
  type: "object",
  properties: {
    reason: { type: "string", description: "One short sentence on how you chose" },
    profile_repose: { type: "integer", description: "Index of the best photo for the profile-at-rest slot, 0 if none qualifies" },
    frontal_repose: { type: "integer", description: "Index of the best photo for the frontal-at-rest slot, 0 if none qualifies" },
    frontal_smiling: { type: "integer", description: "Index of the best photo for the frontal-smiling slot, 0 if none qualifies" },
  },
  required: ["reason", "profile_repose", "frontal_repose", "frontal_smiling"],
  additionalProperties: false,
};

const FACE_PICK_SYSTEM = `You choose which extraoral photographs of one orthodontic patient go into three slots of the Invisalign Doctor Site. You receive several photos, each with an index.

Slots:
- profile_repose: a TRUE side profile (head turned about 90 degrees, only one ear visible, nose pointing sideways), lips closed and at rest, no smile, the whole head and the top of the shoulders in the frame.
- frontal_repose: the face looking STRAIGHT at the camera (both sides of the face and both ears equally visible, nose pointing at the camera), lips at rest, not smiling, the whole face from above the hair to below the chin in the frame.
- frontal_smiling: the same straight frontal view but clearly smiling with teeth showing, whole face in the frame.

Never choose: a three-quarter or oblique view (the head turned partly, one ear clearly nearer the camera but the far cheek still visible); a close-up that shows only the mouth, the smile or the lower face without the whole head; a smiling profile for profile_repose; a photo where the eyes are closed or the face is cut off. If a photo is sideways or upside down that is fine, do not reject it for that. Among several valid candidates prefer the sharpest, best exposed, most centred one. Return 0 for a slot that has no valid photo. Do not use the same photo for two slots.`;

async function pickFaces(images, effort) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: `Choose the best photo index for each of the three slots among these ${images.length} photos (0 if none qualifies).` });
  return askClaude({ system: FACE_PICK_SYSTEM, content, schema: FACE_PICK_SCHEMA, effort: pickEffort(effort, "medium"), model: CROP_MODEL });
}

async function readUpright(a, b, effort, modelName) {
  const content = [
    { type: "text", text: "Version A:" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: a } },
    { type: "text", text: "Version B (version A rotated by 180 degrees):" },
    { type: "image", source: { type: "base64", media_type: "image/jpeg", data: b } },
    { type: "text", text: "Which version is upright, with the upper jaw at the top?" },
  ];
  return askClaude({ system: UPRIGHT_SYSTEM, content, schema: UPRIGHT_SCHEMA, effort: pickEffort(effort, "medium"), model: modelName === "opus" ? MODEL : CROP_MODEL });
}

async function readPose(images, effort, modelName) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: `Report the orientation of ${images.length === 1 ? "this photo" : "all " + images.length + " photos"}.` });
  const result = await askClaude({ system: POSE_SYSTEM, content, schema: POSE_SCHEMA, effort: pickEffort(effort, "medium"), model: modelName === "opus" ? MODEL : CROP_MODEL });
  return result.items;
}

// Boşluk ızgarası: ekran görüntüsündeki diş arası boşluk ölçüleri (mm).
const SPACES_SYSTEM = [
  "You read orthodontic interproximal (residual) space measurements from a screenshot: it may come from",
  "ClinCheck or iTero software, a dental arch chart, or a printed/handwritten form. Report every contact",
  "that shows a space greater than 0 mm. Identify teeth in FDI two-digit notation (quadrant.tooth):",
  "upper right 1.8-1.1, upper left 2.1-2.8, lower left 3.1-3.8, lower right 4.1-4.8. A contact is written",
  "as two adjacent teeth, e.g. \"1.3-1.2\" (between the upper right canine and lateral incisor) or \"1.1-2.1\"",
  "(upper midline). If the image uses Universal numbering (1-32) or Palmer notation, convert it to FDI.",
  "Values are millimetres, usually between 0.1 and 3.0; read decimals exactly as shown (a comma is a decimal",
  "separator). Only report values you can actually read. The notes field is shown to a Turkish-speaking",
  "dental assistant: write it in Turkish, keep it to one short sentence, and use it only for something",
  "unclear or ambiguous (an unreadable value, a tooth you could not identify). Do not describe the image or",
  "explain the notation; if everything was clear, leave notes empty. If the image shows no space",
  "measurements at all, return an empty list and say so in notes (in Turkish).",
].join(" ");

const SPACES_SCHEMA = {
  type: "object",
  properties: {
    contacts: {
      type: "array",
      items: {
        type: "object",
        properties: {
          teeth: { type: "string", description: "Two adjacent FDI teeth, like 1.3-1.2" },
          mm: { type: "number", description: "Space in millimetres" },
        },
        required: ["teeth", "mm"],
        additionalProperties: false,
      },
    },
    notes: { type: "string" },
  },
  required: ["contacts", "notes"],
  additionalProperties: false,
};

async function readSpaces(image) {
  const content = [
    { type: "image", source: { type: "base64", media_type: image.media_type || "image/jpeg", data: image.data } },
    { type: "text", text: "List every interproximal space with its two FDI teeth and the value in mm." },
  ];
  return askClaude({ system: SPACES_SYSTEM, content, schema: SPACES_SCHEMA, effort: "high" });
}

async function choosePortrait(images) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: `Image ${img.index}:` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: img.data },
    });
  }
  content.push({ type: "text", text: "Choose the portrait." });
  return askClaude({ system: PORTRAIT_SYSTEM, content, schema: PORTRAIT_SCHEMA, effort: "medium" });
}

function describeError(error) {
  if (error instanceof Anthropic.AuthenticationError) {
    return "API anahtarı geçersiz. Ayarlardan kontrol edin.";
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return "Bu API anahtarının bu modele erişim izni yok.";
  }
  if (error instanceof Anthropic.RateLimitError) {
    return "İstek sınırına takıldı. Bir dakika sonra yeniden deneyin.";
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return "Anthropic'e bağlanılamadı. İnternet bağlantısını kontrol edin.";
  }
  if (error instanceof Anthropic.APIError) {
    return `API hatası (${error.status}): ${error.message}`;
  }
  return error?.message || String(error);
}

// ---------- Rxalign girişi (Firebase Authentication, e-posta/şifre; REST) ----------
// Firestore kuralları yalnızca giriş yapmış klinik hesaplarına açık. Oturumun yenileme anahtarı
// chrome.storage.local "rxAuth" içinde durur; şifre saklanmaz. ID token ~1 saat geçerli, süresi
// dolmadan securetoken ile yenilenir. Giriş yapılmamışsa okumalar kimliksiz denenir (eski kurallar
// açıkken çalışır; kurallar kapanınca 403 gelir ve hata iletisi ayarlara yönlendirir).

const AUTH_SIGNIN_URL = `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${FIREBASE_API_KEY}`;
const AUTH_REFRESH_URL = `https://securetoken.googleapis.com/v1/token?key=${FIREBASE_API_KEY}`;
const TOKEN_MARGIN_MS = 60 * 1000;
let refreshingToken = null;

const AUTH_ERRORS = {
  EMAIL_NOT_FOUND: "Bu e-posta ile hesap bulunamadı.",
  INVALID_PASSWORD: "Şifre hatalı.",
  INVALID_LOGIN_CREDENTIALS: "E-posta ya da şifre hatalı.",
  INVALID_EMAIL: "E-posta adresi geçersiz.",
  MISSING_PASSWORD: "Şifre boş.",
  USER_DISABLED: "Bu hesap kapatılmış. Klinik yöneticisine başvurun.",
  TOO_MANY_ATTEMPTS_TRY_LATER: "Çok fazla deneme yapıldı; birkaç dakika sonra yeniden deneyin.",
  PASSWORD_LOGIN_DISABLED: "E-posta/şifre girişi Firebase konsolunda açılmamış.",
  OPERATION_NOT_ALLOWED: "E-posta/şifre girişi Firebase konsolunda açılmamış.",
};

function describeAuthError(code, status) {
  const key = String(code || "").split(" ")[0].split(":")[0];
  return AUTH_ERRORS[key] || `Giriş yapılamadı (${key || status || "hata"}).`;
}

async function authState() {
  const data = await chrome.storage.local.get("rxAuth");
  return data.rxAuth || null;
}

async function setAuthState(state) {
  if (state) await chrome.storage.local.set({ rxAuth: state });
  else await chrome.storage.local.remove("rxAuth");
  return state;
}

function publicAuth(state) {
  return state ? { email: state.email, uid: state.uid, signedInAt: state.signedInAt, source: state.source || "manual" } : null;
}

async function rxSignIn(email, password) {
  if (!email || !password) throw new Error("E-posta ve şifre gerekli.");
  const response = await fetch(AUTH_SIGNIN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password, returnSecureToken: true }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(describeAuthError(body?.error?.message, response.status));
  return setAuthState({
    email: body.email || email,
    uid: body.localId || "",
    idToken: body.idToken,
    refreshToken: body.refreshToken,
    expiresAt: Date.now() + Number(body.expiresIn || 3600) * 1000,
    signedInAt: Date.now(),
  });
}

async function refreshIdToken(state) {
  const response = await fetch(AUTH_REFRESH_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=refresh_token&refresh_token=" + encodeURIComponent(state.refreshToken),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const code = body?.error?.message || "";
    if (/TOKEN_EXPIRED|USER_DISABLED|USER_NOT_FOUND|INVALID_REFRESH_TOKEN|INVALID_GRANT|MISSING_REFRESH_TOKEN/.test(code)) {
      await setAuthState(null);
      throw new Error("Rxalign oturumu düştü; eklenti simgesine tıklayıp ayarlardan yeniden giriş yapın.");
    }
    throw new Error("Rxalign oturumu yenilenemedi: " + (code || response.status));
  }
  return setAuthState({
    ...state,
    idToken: body.id_token,
    refreshToken: body.refresh_token || state.refreshToken,
    uid: body.user_id || state.uid,
    expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000,
  });
}

// Geçerli ID token; giriş yoksa null. force: süresi dolmamış olsa da yenile (401 sonrası).
async function getIdToken(force) {
  const state = await authState();
  if (!state || !state.refreshToken) return null;
  if (!force && state.idToken && state.expiresAt - TOKEN_MARGIN_MS > Date.now()) return state.idToken;
  if (!refreshingToken) refreshingToken = refreshIdToken(state).finally(() => { refreshingToken = null; });
  return (await refreshingToken).idToken;
}

// ---------- Kayıtlı formlar (Firestore, yalnızca okuma) ----------

const FORMS_URL =
  `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}` +
  "/databases/(default)/documents/invisalign_forms";

const LIST_FIELDS = [
  "hasta_adi",
  "hasta_soyadi",
  "hasta_mi",
  "checked_in",
  "form_turu",
  "hasta_tipi",
  "urun_tipi_yetiskin",
  "urun_tipi_ergen",
  "urun_tipi_cocuk",
  "tedavi_secenegi",
  "tedavi_secenegi_ergen",
  "tedavi_secenegi_cocuk_first",
  "createdAt",
];

function decodeValue(value) {
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields || {});
  return null;
}

// Form alan adlarında nokta var ("dis_sinir_1.8_..."); güncellenen kayıtlarda Firestore
// bunları iç içe haritaya çevirebildiği için haritalar yeniden noktalı ada açılır.
function decodeFields(fields, prefix = "", out = {}) {
  for (const [name, value] of Object.entries(fields)) {
    if ("mapValue" in value) {
      decodeFields(value.mapValue.fields || {}, `${prefix}${name}.`, out);
    } else {
      out[prefix + name] = decodeValue(value);
    }
  }
  return out;
}

async function firestoreGet(url) {
  let token = await getIdToken(false);
  const withToken = (t) => fetch(url, t ? { headers: { Authorization: `Bearer ${t}` } } : undefined);
  let response = await withToken(token);
  if (token && response.status === 401) {
    token = await getIdToken(true);
    response = await withToken(token);
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(token
      ? "Rxalign hesabının (" + ((await authState())?.email || "?") + ") kayıtlara erişim izni yok; hesabın klinik listesine (rxalign_users) eklenmesi gerekir."
      : "Kayıtlı formlar giriş istiyor: eklenti simgesine tıklayıp ayarlardan Rxalign hesabıyla giriş yapın.");
  }
  if (!response.ok) throw new Error(`Firestore ${response.status}`);
  return response.json();
}

// Ayarlar sayfasındaki "Bağlantıyı sına": tek belge okur; token'lı mı okunduğunu bildirir.
async function testFormsAccess() {
  const token = await getIdToken(false);
  const page = await firestoreGet(`${FORMS_URL}?pageSize=1&mask.fieldPaths=checked_in&key=${FIREBASE_API_KEY}`);
  return { authenticated: !!token, documents: (page.documents || []).length };
}

async function listForms() {
  const mask = LIST_FIELDS.map((f) => `mask.fieldPaths=${f}`).join("&");
  const records = [];
  let pageToken = "";
  do {
    const page = await firestoreGet(
      `${FORMS_URL}?pageSize=300&${mask}&key=${FIREBASE_API_KEY}` +
        (pageToken ? `&pageToken=${encodeURIComponent(pageToken)}` : ""),
    );
    for (const doc of page.documents || []) {
      records.push({ id: doc.name.split("/").pop(), ...decodeFields(doc.fields || {}) });
    }
    pageToken = page.nextPageToken || "";
  } while (pageToken);
  return records;
}

async function getForm(id) {
  const doc = await firestoreGet(`${FORMS_URL}/${encodeURIComponent(id)}?key=${FIREBASE_API_KEY}`);
  return decodeFields(doc.fields || {});
}


// ---------- Kırpma kutuları (crop.js, yüklemeden önce) ----------
// Çerçeve tarifi tools/crop-trial sayfasında kullanıcıyla denendi; değiştirirken orayla aynı tutun.
const CROP_SLOTS = ["profile_repose", "profile_smiling", "frontal_repose", "frontal_smiling", "occlussal_upper", "occlussal_lower",
  "buccal_right", "buccal_left", "labial_anterior", "other"];

const CROP_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          slot: { type: "string", enum: CROP_SLOTS },
          x0: { type: "number" },
          y0: { type: "number" },
          x1: { type: "number" },
          y1: { type: "number" },
          confidence: { type: "number" },
          // Ölçümler (yalnız ön/yan ağız içi; crop.js intraoralFrame bunlardan çerçeve ve eğim hesaplar)
          plane_x0: { type: "number" },
          plane_y0: { type: "number" },
          plane_x1: { type: "number" },
          plane_y1: { type: "number" },
          teeth_top: { type: "number" },
          teeth_bottom: { type: "number" },
          midline_x: { type: "number" },
          view_rotation: { type: "integer", enum: [0, 90, 270] },
          teeth_left: { type: "number" },
          teeth_right: { type: "number" },
          lip_upper_y: { type: "number" },
          lip_lower_y: { type: "number" },
          c_left_x: { type: "number" },
          c_right_x: { type: "number" },
          far_left_x: { type: "number" },
          far_right_x: { type: "number" },
          arms: {
            type: "array",
            items: {
              type: "object",
              properties: { x: { type: "number" }, top: { type: "number" }, bottom: { type: "number" } },
              required: ["x", "top", "bottom"],
              additionalProperties: false,
            },
          },
          note: { type: "string" },
        },
        required: ["index", "slot", "x0", "y0", "x1", "y1", "confidence", "plane_x0", "plane_y0", "plane_x1", "plane_y1", "teeth_top", "teeth_bottom", "midline_x", "view_rotation", "teeth_left", "teeth_right", "lip_upper_y", "lip_lower_y", "c_left_x", "c_right_x", "far_left_x", "far_right_x", "arms", "note"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

const CROP_SYSTEM = `You crop orthodontic patient photographs for the Invisalign Doctor Site. You receive several photos from one patient's folder, each labelled with an index. For every photo return its slot and a crop box; for intraoral front and side views also return the measurements described below.

slot: profile_repose (face in a true side profile, about 90 degrees, one ear visible, lips closed and at rest, no smile, no teeth showing), profile_smiling (the same true side profile but smiling or with teeth showing; it does not belong in the profile slot), frontal_repose (face looking straight at the camera, both sides of the face equally visible, lips at rest, not smiling), frontal_smiling (face looking straight at the camera, clearly smiling with teeth showing), occlussal_upper (upper arch seen in a mirror, biting surfaces: ONE arch only, palate behind the teeth, the opposing arch is not visible), occlussal_lower (lower arch in a mirror: tongue behind the teeth), buccal_right (teeth seen from the patient's right cheek side), buccal_left (from the left cheek side), labial_anterior (front view of both arches with cheek retractors; upper and lower teeth meet, so a photo that shows both arches together is never occlusal, even when it is held sideways or upside down), other (anything else: scans, non-clinical, face photos taken from an oblique or three-quarter angle, which are neither frontal nor profile, and close-ups of only the mouth or smile where the whole face from forehead to chin is not in the frame: those are never frontal_smiling or frontal_repose).

Crop box: x0, y0, x1, y1 as fractions of the image width and height (0..1, x to the right, y downward), the SMALLEST box that still contains everything clinically needed, measured on the image exactly as shown (do not rotate or mirror it, even if it is sideways or upside down):
- intraoral front and side views (labial_anterior, buccal): sideways, the box starts at the innermost point of the concave inner curve of the C-shaped cheek retractor on each side, so the curved back of the C and the cheek beyond it are outside; in a side view, where the opposite retractor shows beyond the front teeth, that edge moves towards the teeth until the opposite retractor is excluded. Every tooth, including the last molars, always stays inside. Vertically the retractor arms set the frame: the top edge crosses the upper retractor arms at half their thickness and the bottom edge crosses the lower arms at half their thickness, so half of each arm is inside the picture and the lips are outside; if the parts above and below the occlusal plane are very unequal, the longer side ends at the fold where the lip meets the gum instead of at the retractor arm. The gums and the full height of the teeth are always inside. If no retractor is visible, include the teeth and gums up to the edges of the lips.
- occlusal views (upper or lower arch, taken with or without a mirror): a TIGHT box around the dental arch, i.e. every tooth of that arch including the last molars and nothing much beyond them. Do not include the face, chin, cheeks, lips, hair, the retractor, the mirror frame or instruments; the software adds a small margin around the teeth bounding box you measure.
- face views (frontal and profile): a portrait framing like a passport photo with more room. Top edge slightly above the top of the hair; bottom edge at the upper chest, just below the collar line, so the neck and the top of the clothing are included (do not stop at the chin); side edges a little outside the ears on both sides (for a profile view: from behind the head to a little in front of the face). The head fills most of the frame and is centred horizontally.
Do not add extra margin beyond these rules, but never exclude any tooth.

Measurements, for labial_anterior and buccal views only (0 for every number and an empty arms list for all other slots), except teeth_top, teeth_bottom, teeth_left and teeth_right, which are also required for occlusal views and used there to crop the picture tightly around the arch, as fractions of the image exactly as shown. The software derives the final frame and the rotation from these measurements, so they matter more than the box itself:
- view_rotation: for labial_anterior and buccal views only (0 for every other slot): 0 when the occlusal plane already runs roughly horizontally in the picture as shown (even if it is upside down), otherwise 90 or 270 (either one) when the photo is held sideways so the occlusal plane runs vertically. When it is 90 or 270, give ALL the measurements below and also the box x0, y0, x1, y1 in the coordinates of the picture after turning it by that many degrees clockwise (so that the plane runs horizontally), as fractions of that turned picture's width and height; the software turns them back. Do not rotate for any other reason.
- plane_x0, plane_y0, plane_x1, plane_y1: two points on the occlusal plane, the line along which the upper and lower teeth meet: the first at the left end of the visible dentition (on the last tooth on the left), the second at the right end. The software rotates the image so that this line becomes level, so place both points exactly on the contact line between the upper and lower teeth; a small vertical error changes the rotation. Give them even if the photo is sideways or upside down.
- midline_x: for labial_anterior only (0 for every other slot): the x of the dental midline, the contact between the two upper central incisors.
- teeth_top, teeth_bottom, teeth_left, teeth_right: the bounding box of all visible tooth crowns (enamel only, gums excluded): the y of the highest and of the lowest point, the x of the leftmost and of the rightmost point.
- lip_upper_y, lip_lower_y: the y of the fold where the inner surface of the upper lip meets the gum above the upper teeth (the deepest point of the upper vestibule, usually a change of colour above the pale attached gum), and of the fold where the inner surface of the lower lip meets the gum below the lower teeth; 0 when that fold is not visible.
- arms: one entry per visible retractor arm, each with x, top and bottom: x is where the arm is measured, near its end closest to the teeth where its full thickness is visible; top and bottom are the y of the upper and lower edges of the arm at that x (its thickness there). A front view normally shows four arms (left and right retractor, upper and lower arm each), a side view at least the two arms of the near-side retractor. Measure every arm you can see; leave the list empty when no retractor is visible.
- c_left_x, c_right_x: when the curved back of a C-shaped retractor is visible at the left / right side of the picture, the x of the innermost point of its concave inner curve (the point of the inside of the C that is closest to the teeth, at the corner of the mouth); 0 when no retractor back is visible on that side.
- far_left_x, far_right_x: when a retractor intrudes from the left / right edge without its curved back being visible (in a side view, the opposite retractor seen beyond the front teeth), the x of its edge nearest the teeth, so that a frame ending there excludes it; 0 when there is none.

confidence: 0..1 for the box. note: a short remark in Turkish only when the photo is unusable for its slot or the box is uncertain, otherwise an empty string.`;

// Sınıflandırma yanıtı kısa: yalnız yuva ve güven (kutu/ölçüm alanları 6 karelik çağrıyı 7-10 sn yapıyordu, 7 Kasım 2026).
const CLASSIFY_SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          index: { type: "integer" },
          slot: { type: "string", enum: CROP_SLOTS },
          confidence: { type: "number" },
        },
        required: ["index", "slot", "confidence"],
        additionalProperties: false,
      },
    },
  },
  required: ["items"],
  additionalProperties: false,
};

async function readCropBoxes(images, effort, known, classify) {
  const content = [];
  for (const img of images) {
    content.push({ type: "text", text: known && img.slot ? `Photo ${img.index} (slot: ${img.slot}):` : `Photo ${img.index}:` });
    content.push({ type: "image", source: { type: "base64", media_type: "image/jpeg", data: img.data } });
  }
  content.push({ type: "text", text: classify ? `Return the slot and your confidence for all ${images.length} photos (no crop box or measurements are needed this time).` : `Return the slot, crop box and measurements for all ${images.length} photos.` });
  if (classify) {
    content.push({ type: "text", text: "These photos are the ones the Doctor Site did not place in a slot. Several may be repeated shots of the same view; label every photo by the view it shows (repeated shots get the same slot, never \"other\" just because they repeat). Use \"other\" only for photos that are not one of the eight views." });
  }
  if (known) {
    content.push({ type: "text", text: "The slot of every photo is already known and is given in its label; it is final. Return exactly that slot for each photo and give the crop box and measurements for that view, measured on the picture exactly as shown (it may be sideways or upside down)." });
  }
  const result = await askClaude({ system: CROP_SYSTEM, content, schema: classify ? CLASSIFY_SCHEMA : CROP_SCHEMA, effort: pickEffort(effort, "high"), model: CROP_MODEL, tag: classify ? "sınıflandırma" : "kırpma kutusu" });
  return result.items;
}

// ---------- Güncelleme denetimi ----------
// latest.json depodan (raw.githubusercontent.com; sitenin kendi alan adında HTTPS sertifikası yok) okunur; yeni sürüm varsa zip, Chrome'a yerel mesajlaşma sunucusu olarak kayıtlı
// güncelleyiciye (updater/updater.ps1; Guncelleyiciyi-Kur.bat ile bir kez kurulur) indirtilir.
// Kurulum kendiliğinden yapılır (seçeneklerden kapatılabilir): tüm IDS sekmelerinde panel 60 sn boşta kaldıysa
// (sekmeler panel etkinliğini "idsActivity" anahtarına yazar), yoksa "Kur" düğmesiyle: zip eklenti klasörünün
// üzerine açılır, eklenti yeniden başlar (açık sayfalardaki yardımcı kopar, sayfa F5 ister).
// Güncelleyici kurulu değilse durum "manual" olur ve panel zip bağlantısını gösterir.
const UPDATE_URL = "https://raw.githubusercontent.com/firatgok/Rxalign/main/ids-extension-release/latest.json";
const UPDATER_HOST = "com.rxalign.idsupdater";
const UPDATE_ALARM = "ids-update-check";
const UPDATE_PERIOD_MINUTES = 5;
const UPDATE_STALE_MS = 5 * 60 * 1000;
const ACTIVITY_IDLE_MS = 60 * 1000;
let checking = null;
let installing = null;

function compareVersions(a, b) {
  const pa = String(a || "").split(".").map((n) => parseInt(n, 10) || 0);
  const pb = String(b || "").split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d;
  }
  return 0;
}

function updaterCall(message) {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendNativeMessage(UPDATER_HOST, message, (reply) => {
      if (chrome.runtime.lastError) {
        const text = chrome.runtime.lastError.message || "";
        return reject(new Error(/not found|bulunamad/i.test(text) ? "güncelleyici kurulu değil" : "güncelleyici: " + text));
      }
      if (!reply) return reject(new Error("güncelleyici yanıt vermedi"));
      if (!reply.ok) return reject(new Error("güncelleyici: " + (reply.error || "hata")));
      resolve(reply);
    });
  });
}

async function updateState() {
  const data = await chrome.storage.local.get("idsUpdate");
  return data.idsUpdate || {};
}

async function setUpdateState(patch) {
  const next = { ...(await updateState()), ...patch };
  await chrome.storage.local.set({ idsUpdate: next });
  return next;
}

// Aynı anda tek denetim; Chrome açılışı, alarm ve sayfa açılışı üst üste gelse de tek istek gider.
function checkForUpdate() {
  if (!checking) checking = runUpdateCheck().finally(() => { checking = null; });
  return checking;
}

// IDS sayfası açılınca son denetim eskiyse arkada yeniden denetlenir; sonuç storage.onChanged ile panele düşer.
async function checkIfStale() {
  const state = await updateState();
  if (Date.now() - (state.checkedAt || 0) > UPDATE_STALE_MS) checkForUpdate().catch(() => {});
}

async function runUpdateCheck() {
  const current = chrome.runtime.getManifest().version;
  const state = await updateState();
  let latest;
  try {
    const response = await fetch(UPDATE_URL, { cache: "no-store" });
    if (!response.ok) throw new Error("HTTP " + response.status);
    latest = await response.json();
    if (!latest || !latest.version || !latest.url) throw new Error("latest.json eksik");
  } catch (error) {
    return setUpdateState({ checkedAt: Date.now(), error: "sürüm bilgisi alınamadı: " + (error.message || error) });
  }
  if (compareVersions(latest.version, current) <= 0) {
    return setUpdateState({ status: "current", version: current, latest: latest.version, checkedAt: Date.now(), error: null });
  }
  if (state.status === "downloaded" && state.version === latest.version) {
    const kept = await setUpdateState({ checkedAt: Date.now(), error: null });
    maybeAutoInstall().catch(() => {});
    return kept;
  }
  const found = { version: latest.version, url: latest.url, notes: latest.notes || "", checkedAt: Date.now(), snoozedAt: null };
  try {
    await updaterCall({ action: "download", url: latest.url, version: latest.version });
    const saved = await setUpdateState({ ...found, status: "downloaded", downloadedAt: Date.now(), error: null });
    maybeAutoInstall().catch(() => {});
    return saved;
  } catch (error) {
    return setUpdateState({ ...found, status: "manual", error: error.message || String(error) });
  }
}

// Tek kurulum aynı anda; kendiliğinden kurulum ile "Kur" düğmesi çakışmasın.
function installUpdate() {
  if (!installing) installing = doInstallUpdate().finally(() => { installing = null; });
  return installing;
}

// Kendiliğinden kurulum: indirilmiş sürüm var, seçenek açık, bu sürüm için daha önce denenmedi ve hiçbir IDS
// sekmesinde son ACTIVITY_IDLE_MS içinde panel etkinliği yok.
async function maybeAutoInstall() {
  const data = await chrome.storage.local.get(["autoInstall", "idsActivity", "idsRxHeartbeat"]);
  if (data.autoInstall === false) return;
  const state = await updateState();
  if (state.status !== "downloaded" || state.autoTried === state.version) return;
  const now = Date.now();
  // Form doldurucu (rx.js) çalışırken 2,5 sn'de bir kalp atışı yazar; doldurma sürerken kurulmaz.
  const filling = data.idsRxHeartbeat && now - Number(data.idsRxHeartbeat.at) < 15000;
  const busy = filling || Object.values(data.idsActivity || {}).some((ts) => now - Number(ts) < ACTIVITY_IDLE_MS);
  if (busy) return;
  await setUpdateState({ autoTried: state.version });
  try {
    await installUpdate();
  } catch (error) {
    await setUpdateState({ error: "kendiliğinden kurulamadı: " + (error.message || error) });
  }
}

async function doInstallUpdate() {
  const state = await updateState();
  if (state.status !== "downloaded") throw new Error("indirilmiş güncelleme yok");
  const reply = await updaterCall({ action: "install", url: state.url, version: state.version });
  const version = reply.version || state.version;
  await setUpdateState({ status: "installed", version, installedAt: Date.now(), error: null });
  // Yanıt sayfaya ulaşsın diye yeniden yükleme biraz sonra; onInstalled "kuruldu" notunu bırakır.
  setTimeout(() => chrome.runtime.reload(), 800);
  return { version };
}

async function ensureUpdateAlarm() {
  const existing = await chrome.alarms.get(UPDATE_ALARM);
  if (!existing || existing.periodInMinutes !== UPDATE_PERIOD_MINUTES) await chrome.alarms.create(UPDATE_ALARM, { delayInMinutes: 1, periodInMinutes: UPDATE_PERIOD_MINUTES });
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === UPDATE_ALARM) checkForUpdate().catch(() => {});
});

chrome.runtime.onInstalled.addListener((details) => {
  ensureUpdateAlarm().catch(() => {});
  const version = chrome.runtime.getManifest().version;
  const announced = details.reason === "update" && details.previousVersion && details.previousVersion !== version
    ? setUpdateState({ status: "current", version, announce: version, snoozedAt: null, error: null })
    : Promise.resolve();
  announced.then(() => checkForUpdate()).catch(() => {});
});
chrome.runtime.onStartup.addListener(() => {
  ensureUpdateAlarm().catch(() => {});
  checkForUpdate().catch(() => {});
});
ensureUpdateAlarm().catch(() => {});

// ---------- Rxalign sitesiyle dış ileti kanalı ----------
// manifest externally_connectable: form sitesi (rxalign.fgoapps.com; geliştirmede localhost) eklentiye
// doğrudan ileti gönderir. İki iş: (1) sitedeki Firebase oturumunu eklentiye aktarmak (ayrıca giriş
// gerekmez), (2) arşivdeki "IDS'te aç" düğmesi: kayıt yeni hastaysa IDS Yeni hasta sayfası, refinement ise
// hastanın dosyası (IDS numarası biliniyorsa) ya da hasta listesi açılır; rx.js kaydı oradan devralır.

const IDS_NEW_PATIENT_URL = "https://vip.invisalign.com/v3/auth/patient/editPatient.action";
const IDS_PATIENT_FILE_URL = "https://vip.invisalign.com/v3/auth/patient/patientFile.action?patientId=";
const IDS_PATIENTS_URL = "https://vip.invisalign.com/v3/auth/patients.action";
const OPEN_KEY = "rxalignOpen"; // rx.js okur: { kind, record, at }
const PICK_KEY = "idsRxPick"; // rx.js'in seçili kayıt anahtarı
const PATIENTS_KEY = "idsRxPatients"; // rx.js: IDS hasta no -> kayıt kimliği

function fromRxalign(sender) {
  let origin = "";
  try { origin = new URL(sender.origin || sender.url || "").origin; } catch (e) { return false; }
  if (origin === "https://rxalign.fgoapps.com") return true;
  return /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
}

function nameTokens(text) {
  return String(text || "").toLocaleLowerCase("tr")
    .replace(/ç/g, "c").replace(/ğ/g, "g").replace(/ı/g, "i").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ü/g, "u")
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .split(/[^a-z0-9]+/).filter(Boolean).sort().join(" ");
}

// Kaydın hastası için bilinen IDS hasta numarası: aynı kayıt ya da aynı adlı başka bir kayıt (ilk tedavi formu)
// daha önce bir IDS hastasıyla eşleştirildiyse.
async function knownPatientId(record) {
  const map = (await chrome.storage.local.get(PATIENTS_KEY))[PATIENTS_KEY] || {};
  const entries = Object.entries(map);
  if (!entries.length) return null;
  const direct = entries.find(([, recId]) => recId === record.id);
  if (direct) return direct[0];
  const wanted = nameTokens(record.hasta_adi + " " + record.hasta_soyadi);
  if (!wanted) return null;
  const records = await listForms();
  const sameName = new Set(records.filter((r) => nameTokens(r.hasta_adi + " " + r.hasta_soyadi) === wanted).map((r) => r.id));
  const hit = entries.find(([, recId]) => sameName.has(recId));
  return hit ? hit[0] : null;
}

function searchWord(record) {
  const longest = (text) => nameTokens(text).split(" ").filter(Boolean).sort((a, b) => b.length - a.length)[0] || "";
  return longest(record.hasta_soyadi) || longest(record.hasta_adi);
}

const EXTERNAL_HANDLERS = {
  "rx-ping": async () => ({ version: chrome.runtime.getManifest().version, auth: publicAuth(await authState()) }),
  // Sitedeki Firebase oturumu: yenileme anahtarı eklentinin kendi girişiyle aynı yere yazılır.
  "rx-auth-set": async (msg) => {
    if (!msg.refreshToken || !msg.uid) throw new Error("oturum bilgisi eksik");
    const current = await authState();
    const same = current && current.refreshToken === msg.refreshToken;
    const state = await setAuthState({
      email: String(msg.email || ""),
      uid: String(msg.uid),
      idToken: msg.idToken || null,
      refreshToken: String(msg.refreshToken),
      expiresAt: Number(msg.expiresAt) || 0,
      signedInAt: same ? current.signedInAt : Date.now(),
      source: "site",
    });
    return { auth: publicAuth(state) };
  },
  // Siteden çıkış: yalnızca siteden alınmış oturum silinir; elle yapılmış eklenti girişi kalır.
  "rx-auth-clear": async () => {
    const current = await authState();
    if (current && current.source === "site") await setAuthState(null);
    return {};
  },
  "rx-open": async (msg) => {
    const record = msg.record || {};
    if (!record.id) throw new Error("kayıt kimliği yok");
    const kind = msg.kind === "refinement" ? "refinement" : "new";
    await chrome.storage.local.set({
      [OPEN_KEY]: { kind, record, at: Date.now() },
      [PICK_KEY]: { id: record.id, at: Date.now() },
    });
    let url = IDS_NEW_PATIENT_URL;
    let opened = "new";
    if (kind === "refinement") {
      const patientId = await knownPatientId(record).catch(() => null);
      if (patientId) { url = IDS_PATIENT_FILE_URL + encodeURIComponent(patientId); opened = "file"; }
      else {
        // IDS araması yalnızca tek sözcükle sonuç verir (ad + soyad birlikte yazılınca boş döner); soyadın en uzun sözcüğü aranır.
        const word = searchWord(record);
        url = IDS_PATIENTS_URL + (word ? "#search=" + encodeURIComponent(word) : "");
        opened = "list";
      }
    }
    await chrome.tabs.create({ url, active: true });
    return { opened };
  },
};

chrome.runtime.onMessageExternal.addListener((msg, sender, sendResponse) => {
  if (!fromRxalign(sender)) { sendResponse({ ok: false, error: "izin verilmeyen kaynak" }); return false; }
  const handler = EXTERNAL_HANDLERS[msg?.type];
  if (!handler) { sendResponse({ ok: false, error: "bilinmeyen ileti: " + (msg?.type || "?") }); return false; }
  handler(msg, sender).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: describeError(error) }),
  );
  return true;
});

const HANDLERS = {
  "ids-orient": async (msg) => ({ items: await orient(msg.images) }),
  "ids-portrait": async (msg) => ({ choice: await choosePortrait(msg.images) }),
  "ids-forms-list": async () => ({ records: await listForms() }),
  "ids-spaces": async (msg) => ({ result: await readSpaces(msg.image) }),
  "ids-crop": async (msg) => ({ items: await readCropBoxes(msg.images, msg.effort, msg.known, msg.classify) }),
  "ids-arch": async (msg) => ({ items: await readArch(msg.images, msg.effort, msg.model) }),
  "ids-pose": async (msg) => ({ items: await readPose(msg.images, msg.effort, msg.model) }),
  "ids-upright": async (msg) => ({ result: await readUpright(msg.a, msg.b, msg.effort, msg.model) }),
  "ids-face-pick": async (msg) => ({ result: await pickFaces(msg.images, msg.effort) }),
  "ids-arch-pair": async (msg) => ({ result: await readArchPair(msg.a, msg.b, msg.effort, msg.model) }),
  "ids-arch-set": async (msg) => ({ items: await readArchSet(msg.images, msg.effort, msg.model) }),
  "ids-bite-set": async (msg) => ({ items: await readBiteSet(msg.images, msg.effort, msg.model) }),
  "ids-buccal-set": async (msg) => ({ items: await readBuccalSet(msg.images, msg.effort, msg.model) }),
  "ids-stats": async () => ({ stats: STATS.splice(0) }),
  "ids-form-get": async (msg) => ({ data: await getForm(msg.id) }),
  "ids-auth-state": async () => ({ auth: publicAuth(await authState()) }),
  "ids-auth-signin": async (msg) => ({ auth: publicAuth(await rxSignIn(String(msg.email || "").trim(), String(msg.password || ""))) }),
  "ids-auth-signout": async () => { await setAuthState(null); return {}; },
  "ids-auth-test": async () => ({ result: await testFormsAccess() }),
  "ids-update-state": async () => {
    checkIfStale();
    return { update: await updateState(), version: chrome.runtime.getManifest().version };
  },
  "ids-update-check": async () => ({ update: await checkForUpdate(), version: chrome.runtime.getManifest().version }),
  "ids-update-install": async () => ({ result: await installUpdate() }),
  "ids-update-snooze": async () => ({ update: await setUpdateState({ snoozedAt: Date.now() }) }),
  "ids-update-idle": async () => { await maybeAutoInstall(); return {}; },
  "ids-update-seen": async () => ({ update: await setUpdateState({ announce: null }) }),
  "ids-update-ping": async () => ({ updater: await updaterCall({ action: "ping" }) }),
  // İçerik betiği yeni sekme açamaz (açılır pencere engeli); CBCT portalı buradan açılır.
  // Klasör izni çerçeve içinde alınamazsa ayar sayfası açılır (oradaki "Okuma iznini yenile").
  "ids-options": async () => {
    await chrome.runtime.openOptionsPage();
    return {};
  },
  // İçerik betiğinin gizli sekmedeki beklemesi (sayfada setTimeout saniyede bire kısılıyor; servis çalışanında kısılmaz).
  "ids-sleep": async (msg) => {
    const ms = Math.max(0, Math.min(Number(msg.ms) || 0, 60000));
    await new Promise((resolve) => setTimeout(resolve, ms));
    return {};
  },
  "ids-open": async (msg) => {
    if (!/^https:\/\/auto\.smarthub\.invisalign\.com\//.test(msg.url || "")) throw new Error("izin verilmeyen adres");
    await chrome.tabs.create({ url: msg.url, active: true });
    return {};
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const handler = HANDLERS[msg?.type];
  if (!handler) return;
  handler(msg).then(
    (result) => sendResponse({ ok: true, ...result }),
    (error) => sendResponse({ ok: false, error: describeError(error) }),
  );
  return true;
});

chrome.action.onClicked.addListener(() => chrome.runtime.openOptionsPage());
