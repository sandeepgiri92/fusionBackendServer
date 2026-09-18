// ============================================================
// FUSION ENTERPRISES — Word Bill Generator (template based)
// ------------------------------------------------------------
// Fills the official bill template (bill-template.docx) with
// entry data WITHOUT changing the format in any way:
//
//   - Invoice No.  -> entry.invoiceNo
//   - Date         -> entry.date (dd/mm/yyyy)
//   - M/s.         -> party name (UNDERLINED)
//   - Address.     -> party address
//   - Table row    -> Sr No: 1 | Particulars: product - serial
//                     (+ warranty remark line only if remarks
//                      contain "warranty") | Qty | Rate | Amount
//   - Rs. in Words -> amount in words (Indian system)
//   - Total        -> total amount
//
// Company header, borders, stamp & signature images remain
// exactly as they are inside the template.
// ============================================================

const path = require("path");
const fs = require("fs");
const JSZip = require("jszip");

const TEMPLATE_PATH = path.join(
  __dirname,
  "..",
  "templates",
  "bill-template.docx",
);

// ============================================================
// BASIC HELPERS
// ============================================================

const escXml = (s) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

const round2 = (n) =>
  Math.round(Number(n || 0) * 100) / 100;

// ============================================================
// MONEY FORMAT
// ============================================================

// 12500     -> "12,500"
// 12500.5   -> "12,500.50"
// 12500.55  -> "12,500.55"

const fmtAmt = (n) => {
  const num = Number(n || 0);

  const hasPaise =
    Math.round(num * 100) % 100 !== 0;

  return num.toLocaleString("en-IN", {
    minimumFractionDigits: hasPaise ? 2 : 0,
    maximumFractionDigits: 2,
  });
};

// ============================================================
// DATE FORMAT
// ============================================================

// dd/mm/yyyy

const fmtDate = (d) => {
  const dt = new Date(d);

  if (Number.isNaN(dt.getTime())) {
    return "";
  }

  const dd = String(
    dt.getDate(),
  ).padStart(2, "0");

  const mm = String(
    dt.getMonth() + 1,
  ).padStart(2, "0");

  return (
    dd +
    "/" +
    mm +
    "/" +
    dt.getFullYear()
  );
};

// ============================================================
// INDIAN NUMBER TO WORDS
// ============================================================

const ONES = [
  "",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];

const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

const twoDigits = (n) =>
  n < 20
    ? ONES[n]
    : TENS[Math.floor(n / 10)] +
      (n % 10
        ? " " + ONES[n % 10]
        : "");

const threeDigits = (n) => {
  const h = Math.floor(n / 100);
  const r = n % 100;

  let s = "";

  if (h) {
    s += ONES[h] + " Hundred";
  }

  if (r) {
    s +=
      (h ? " " : "") +
      twoDigits(r);
  }

  return s;
};

const numberToWordsIndian = (num) => {
  num = Math.floor(Number(num) || 0);

  if (num === 0) {
    return "Zero";
  }

  const crore = Math.floor(
    num / 10000000,
  );

  num %= 10000000;

  const lakh = Math.floor(
    num / 100000,
  );

  num %= 100000;

  const thousand = Math.floor(
    num / 1000,
  );

  num %= 1000;

  const hundred = num;

  let s = "";

  if (crore) {
    s +=
      threeDigits(crore) +
      " Crore ";
  }

  if (lakh) {
    s +=
      twoDigits(lakh) +
      " Lakh ";
  }

  if (thousand) {
    s +=
      twoDigits(thousand) +
      " Thousand ";
  }

  if (hundred) {
    s += threeDigits(hundred);
  }

  return s.trim();
};

const amountInWords = (n) => {
  const num = Number(n || 0);

  const rupees = Math.floor(num);

  const paise = Math.round(
    (num - rupees) * 100,
  );

  let w =
    numberToWordsIndian(rupees) +
    " Rupees";

  if (paise > 0) {
    w +=
      " and " +
      numberToWordsIndian(paise) +
      " Paise";
  }

  return w + " Only";
};

// ============================================================
// RUN BUILDERS
// ============================================================

// ------------------------------------------------------------
// Body text runs
//
// underline = true only where required.
// Currently used only for Party Name.
//
// Example:
// bodyRun("ABC Enterprises", 24, true)
//
// Result:
// ABC Enterprises -> underlined
// ------------------------------------------------------------

const bodyRun = (
  text,
  sz,
  underline = false,
) => {
  const sizeXml = sz
    ? `<w:sz w:val="${sz}"/>`
    : "";

  const underlineXml = underline
    ? '<w:u w:val="single"/>'
    : "";

  return `<w:r><w:rPr><w:color w:val="030303"/>${sizeXml}${underlineXml}</w:rPr><w:t xml:space="preserve">${escXml(
    text,
  )}</w:t></w:r>`;
};

// ------------------------------------------------------------
// Size for body value so it stays on its own line
// ------------------------------------------------------------

const fitSize = (
  text,
  softLimit,
) => {
  const len = String(
    text || "",
  ).length;

  if (len <= softLimit) {
    return undefined;
  }

  if (len <= softLimit + 3) {
    return 24;
  }

  return 20;
};

// ============================================================
// TABLE CELL HELPERS
// ============================================================

const CELL_W = {
  sr: "1104",
  part: "3774",
  qty: "654",
  rate: "948",
  amount: "1416",
};

const cellSz = (text) => {
  const len = String(
    text || "",
  ).length;

  if (len <= 6) {
    return 30;
  }

  if (len <= 8) {
    return 26;
  }

  if (len <= 10) {
    return 22;
  }

  return 20;
};

const cellRun = (
  text,
  sz,
) => {
  const s =
    sz || cellSz(text);

  return `<w:r><w:rPr><w:color w:val="030303"/><w:sz w:val="${s}"/></w:rPr><w:t xml:space="preserve">${escXml(
    text,
  )}</w:t></w:r>`;
};

// ============================================================
// MULTI-LINE PARTICULARS
// ============================================================

const cellRunsMulti = (
  lines,
) =>
  lines
    .filter((l) => l !== "")
    .map((l, i) => {
      const br =
        i > 0
          ? "<w:br/>"
          : "";

      return `<w:r><w:rPr><w:color w:val="030303"/><w:sz w:val="30"/></w:rPr>${br}<w:t xml:space="preserve">${escXml(
        l,
      )}</w:t></w:r>`;
    })
    .join("");

// ============================================================
// "Rs. in Words" VALUE
// ============================================================

const TNR = {
  " ": 250,
  "/": 278,
  ".": 250,
  ",": 250,
  "-": 333,
  "&": 778,
  "'": 180,

  A: 722,
  B: 667,
  C: 667,
  D: 722,
  E: 611,
  F: 556,
  G: 722,
  H: 722,
  I: 333,
  J: 389,
  K: 722,
  L: 611,
  M: 889,
  N: 722,
  O: 722,
  P: 556,
  Q: 722,
  R: 667,
  S: 556,
  T: 611,
  U: 722,
  V: 722,
  W: 944,
  X: 722,
  Y: 722,
  Z: 611,

  a: 444,
  b: 500,
  c: 444,
  d: 500,
  e: 444,
  f: 333,
  g: 500,
  h: 500,
  i: 278,
  j: 278,
  k: 500,
  l: 278,
  m: 778,
  n: 500,
  o: 500,
  p: 500,
  q: 500,
  r: 333,
  s: 389,
  t: 278,
  u: 500,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
};

const estWidthTw = (
  text,
  pt,
) => {
  let em = 0;

  for (const ch of String(text)) {
    em +=
      TNR[ch] !== undefined
        ? TNR[ch]
        : 500;
  }

  return (
    (em / 1000) *
    pt *
    20
  );
};

const wordsSizeHalfPt = (
  text,
) => {
  const AVAIL = 3510;

  for (const pt of [
    12,
    11,
    10,
    9,
    8,
  ]) {
    if (
      estWidthTw(text, pt) *
        1.04 <=
      AVAIL
    ) {
      return pt * 2;
    }
  }

  return 16;
};

const wordsRun = (
  text,
) =>
  `<w:r><w:rPr><w:color w:val="030303"/><w:sz w:val="${wordsSizeHalfPt(
    text,
  )}"/></w:rPr><w:t xml:space="preserve"> ${escXml(
    text,
  )}</w:t></w:r>`;

// ============================================================
// LOW LEVEL XML SURGERY
// ============================================================

// Insert snippet right after first occurrence of anchor.

function insertAfter(
  xml,
  anchor,
  snippet,
  from = 0,
) {
  const i = xml.indexOf(
    anchor,
    from,
  );

  if (i === -1) {
    return null;
  }

  const pos =
    i + anchor.length;

  return (
    xml.slice(0, pos) +
    snippet +
    xml.slice(pos)
  );
}

// ============================================================
// ROW BOUNDS
// ============================================================

function rowBounds(
  xml,
  trHeightMarker,
) {
  const marker =
    xml.indexOf(
      trHeightMarker,
    );

  if (marker === -1) {
    return null;
  }

  const start =
    xml.lastIndexOf(
      "<w:tr ",
      marker,
    );

  const end =
    xml.indexOf(
      "</w:tr>",
      marker,
    ) +
    "</w:tr>".length;

  if (
    start === -1 ||
    end === -1
  ) {
    return null;
  }

  return [start, end];
}

// ============================================================
// CELL BOUNDS
// ============================================================

function cellBounds(
  row,
  width,
  from = 0,
) {
  const needle =
    `<w:tcW w:w="${width}"`;

  const i = row.indexOf(
    needle,
    from,
  );

  if (i === -1) {
    return null;
  }

  const start =
    row.lastIndexOf(
      "<w:tc>",
      i,
    );

  const end =
    row.indexOf(
      "</w:tc>",
      i,
    ) +
    "</w:tc>".length;

  return [start, end];
}

// ============================================================
// ADD CELL PADDING
// ============================================================

const addCellPadding = (
  row,
  cellStart,
  cellEnd,
  left = 70,
  right = 70,
) => {
  const cell = row.slice(
    cellStart,
    cellEnd,
  );

  const tcPrStart =
    cell.indexOf(
      "<w:tcPr>",
    );

  const tcPrEnd =
    cell.indexOf(
      "</w:tcPr>",
    );

  if (
    tcPrStart === -1 ||
    tcPrEnd === -1
  ) {
    return row;
  }

  const paddingXml = `
    <w:tcMar>
      <w:top w:w="0" w:type="dxa"/>
      <w:left w:w="${left}" w:type="dxa"/>
      <w:bottom w:w="0" w:type="dxa"/>
      <w:right w:w="${right}" w:type="dxa"/>
    </w:tcMar>
  `;

  const insertPos =
    tcPrStart +
    "<w:tcPr>".length;

  const newCell =
    cell.slice(0, insertPos) +
    paddingXml +
    cell.slice(insertPos);

  return (
    row.slice(0, cellStart) +
    newCell +
    row.slice(cellEnd)
  );
};

// ============================================================
// FILL CELL
// ============================================================

function fillCell(
  row,
  width,
  runsXml,
  from = 0,
) {
  const b = cellBounds(
    row,
    width,
    from,
  );

  if (!b) {
    return null;
  }

  const pPrEnd =
    row.indexOf(
      "</w:pPr>",
      b[0],
    );

  if (
    pPrEnd === -1 ||
    pPrEnd > b[1]
  ) {
    return null;
  }

  const padding = {
    1104: {
      left: 70,
      right: 70,
    },

    3774: {
      left: 100,
      right: 100,
    },

    654: {
      left: 70,
      right: 70,
    },

    948: {
      left: 70,
      right: 70,
    },

    1416: {
      left: 70,
      right: 70,
    },
  };

  const pad =
    padding[width] || {
      left: 70,
      right: 70,
    };

  const cellStart = b[0];
  const cellEnd = b[1];

  let updatedRow =
    addCellPadding(
      row,
      cellStart,
      cellEnd,
      pad.left,
      pad.right,
    );

  const newBounds =
    cellBounds(
      updatedRow,
      width,
      from,
    );

  if (!newBounds) {
    return null;
  }

  const newPPrEnd =
    updatedRow.indexOf(
      "</w:pPr>",
      newBounds[0],
    );

  if (
    newPPrEnd === -1 ||
    newPPrEnd > newBounds[1]
  ) {
    return null;
  }

  const pos =
    newPPrEnd +
    "</w:pPr>".length;

  return {
    row:
      updatedRow.slice(
        0,
        pos,
      ) +
      runsXml +
      updatedRow.slice(pos),

    from: pos,
  };
}

// ============================================================
// DATA PREPARATION
// ============================================================

function buildBillData({
  type,
  party,
  entry,
}) {
  const isService =
    String(type) ===
    "Service";

  const amount = round2(
    entry?.amount || 0,
  );

  const qty =
    Number(entry?.qty) > 0
      ? Number(entry.qty)
      : 1;

  const rate =
    Number(entry?.rate) > 0
      ? round2(entry.rate)
      : round2(
          amount / qty,
        );

  const invoiceNo =
    isService
      ? String(
          entry?.invoiceNo ||
            `SR-${String(
              entry?._id || "",
            )
              .slice(-8)
              .toUpperCase()}`,
        )
      : String(
          entry?.invoiceNo || "",
        );

  const particulars =
    isService
      ? String(
          entry?.serviceDetail ||
            "Service charges",
        ).trim()
      : [
          String(
            entry?.productName ||
              "",
          ).trim(),

          String(
            entry?.serialNo ||
              "",
          ).trim(),
        ]
          .filter(Boolean)
          .join(" - ");

  const remarks = String(
    entry?.remarks || "",
  ).trim();

  const warrantyLine =
    /warrant/i.test(
      remarks,
    )
      ? remarks
      : "";

  return {
    isService,

    invoiceNo,

    date: fmtDate(
      entry?.date,
    ),

    // Party Name
    partyName: String(
      party?.name || "",
    ).trim(),

    address: String(
      party?.address || "",
    ).trim(),

    particularsLines: [
      particulars,
      warrantyLine,
    ],

    qty: String(qty),

    rate: fmtAmt(rate),

    amount: fmtAmt(amount),

    words: amountInWords(
      amount,
    ),

    total: fmtAmt(amount),
  };
}

// ============================================================
// TEMPLATE FILLING
// ============================================================

async function fillTemplate(
  data,
) {
  // ----------------------------------------------------------
  // Read DOCX template
  // ----------------------------------------------------------

  const templateBuffer =
    fs.readFileSync(
      TEMPLATE_PATH,
    );

  const zip =
    await JSZip.loadAsync(
      templateBuffer,
    );

  let xml =
    await zip
      .file(
        "word/document.xml",
      )
      .async("string");

  // ----------------------------------------------------------
  // 1) Invoice No.
  // ----------------------------------------------------------

  let p =
    xml.indexOf(
      ">Invoice No</w:t>",
    );

  if (p === -1) {
    throw new Error(
      "Template anchor missing: Invoice No",
    );
  }

  xml = insertAfter(
    xml,
    '<w:t xml:space="preserve">. </w:t></w:r>',

    bodyRun(
      data.invoiceNo,
      fitSize(
        data.invoiceNo,
        12,
      ),
    ),

    p,
  );

  // ----------------------------------------------------------
  // 2) Date
  // ----------------------------------------------------------

  p =
    xml.indexOf(
      ">Date:</w:t>",
    );

  if (p === -1) {
    throw new Error(
      "Template anchor missing: Date",
    );
  }

  const dateRunEnd =
    xml.indexOf(
      "</w:r>",
      p,
    ) +
    "</w:r>".length;

  const spaceRunEnd =
    xml.indexOf(
      "</w:r>",
      dateRunEnd,
    ) +
    "</w:r>".length;

  xml =
    xml.slice(
      0,
      spaceRunEnd,
    ) +
    bodyRun(
      data.date,
      24,
    ) +
    xml.slice(
      spaceRunEnd,
    );

  // ----------------------------------------------------------
  // 3) M/s. — PARTY NAME
  //
  // IMPORTANT:
  // M/s. itself is NOT underlined.
  // Only data.partyName is underlined.
  // ----------------------------------------------------------

  p =
    xml.indexOf(
      ">M/s.</w:t>",
    );

  if (p === -1) {
    throw new Error(
      "Template anchor missing: M/s",
    );
  }

  xml = insertAfter(
    xml,

    '<w:t xml:space="preserve"> </w:t></w:r>',

    bodyRun(
      data.partyName,
      fitSize(
        data.partyName,
        50,
      ),
      true,
    ),

    p,
  );

  // ----------------------------------------------------------
  // 4) Address
  // ----------------------------------------------------------

  if (data.address) {
    p =
      xml.indexOf(
        ">Address</w:t>",
      );

    if (p !== -1) {
      xml = insertAfter(
        xml,

        '<w:t xml:space="preserve">. </w:t></w:r>',

        bodyRun(
          data.address,
          fitSize(
            data.address,
            55,
          ),
        ),

        p,
      );
    }
  }

  // ----------------------------------------------------------
  // 5) Item row
  // ----------------------------------------------------------

  const ITEM_ROW =
    '<w:trHeight w:val="4638"/>';

  let searchFrom = 0;
  let itemCount = 0;

  while (true) {
    const marker =
      xml.indexOf(
        ITEM_ROW,
        searchFrom,
      );

    if (marker === -1) {
      break;
    }

    const trStart =
      xml.lastIndexOf(
        "<w:tr ",
        marker,
      );

    const trEnd =
      xml.indexOf(
        "</w:tr>",
        marker,
      ) +
      "</w:tr>".length;

    let row =
      xml.slice(
        trStart,
        trEnd,
      );

    let cursor = 0;

    // --------------------------------------------------------
    // Sr. No
    // --------------------------------------------------------

    let nb = fillCell(
      row,
      "1104",
      cellRun("1"),
      cursor,
    );

    if (nb) {
      row = nb.row;
      cursor = nb.from;
    }

    // --------------------------------------------------------
    // Particulars
    // --------------------------------------------------------

    nb = fillCell(
      row,
      "3774",
      cellRunsMulti(
        data.particularsLines,
      ),
      cursor,
    );

    if (nb) {
      row = nb.row;
      cursor = nb.from;
    }

    // --------------------------------------------------------
    // Qty
    // --------------------------------------------------------

    nb = fillCell(
      row,
      "654",
      cellRun(data.qty),
      cursor,
    );

    if (nb) {
      row = nb.row;
      cursor = nb.from;
    }

    // --------------------------------------------------------
    // Rate
    // --------------------------------------------------------

    nb = fillCell(
      row,
      "948",
      cellRun(data.rate),
      cursor,
    );

    if (nb) {
      row = nb.row;
      cursor = nb.from;
    }

    // --------------------------------------------------------
    // Amount
    // --------------------------------------------------------

    nb = fillCell(
      row,
      "1416",
      cellRun(data.amount),
      cursor,
    );

    if (nb) {
      row = nb.row;
      cursor = nb.from;
    }

    xml =
      xml.slice(
        0,
        trStart,
      ) +
      row +
      xml.slice(trEnd);

    itemCount += 1;

    searchFrom =
      trStart +
      row.length;
  }

  if (itemCount === 0) {
    throw new Error(
      "Template anchor missing: item row",
    );
  }

  // ----------------------------------------------------------
  // 6) Rs. in Words + Total row
  // ----------------------------------------------------------

  xml = xml
    .split(
      '<w:trHeight w:val="497"/>',
    )
    .join(
      '<w:trHeight w:val="497" w:hRule="atLeast"/>',
    );

  const WORDS_ROW =
    '<w:trHeight w:val="497" w:hRule="atLeast"/>';

  searchFrom = 0;

  let wordsCount = 0;

  while (true) {
    const marker =
      xml.indexOf(
        WORDS_ROW,
        searchFrom,
      );

    if (marker === -1) {
      break;
    }

    const trStart =
      xml.lastIndexOf(
        "<w:tr ",
        marker,
      );

    const trEnd =
      xml.indexOf(
        "</w:tr>",
        marker,
      ) +
      "</w:tr>".length;

    let row =
      xml.slice(
        trStart,
        trEnd,
      );

    // --------------------------------------------------------
    // Words value
    // --------------------------------------------------------

    const label =
      ">Words:</w:t></w:r>";

    const li =
      row.indexOf(label);

    if (li !== -1) {
      const pos =
        li + label.length;

      row =
        row.slice(
          0,
          pos,
        ) +
        wordsRun(
          data.words,
        ) +
        row.slice(pos);
    }

    // --------------------------------------------------------
    // Total amount
    // --------------------------------------------------------

    const nb = fillCell(
      row,
      "1416",
      cellRun(
        data.total,
      ),
      0,
    );

    if (nb) {
      row = nb.row;
    }

    xml =
      xml.slice(
        0,
        trStart,
      ) +
      row +
      xml.slice(trEnd);

    wordsCount += 1;

    searchFrom =
      trStart +
      row.length;
  }

  if (wordsCount === 0) {
    throw new Error(
      "Template anchor missing: words/total row",
    );
  }

  // ----------------------------------------------------------
  // Save modified XML back to DOCX
  // ----------------------------------------------------------

  zip.file(
    "word/document.xml",
    xml,
  );

  return zip.generateAsync({
    type: "nodebuffer",

    compression: "DEFLATE",

    compressionOptions: {
      level: 6,
    },

    mimeType:
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

// ============================================================
// PUBLIC API
// ============================================================

async function generateBillDocx({
  type,
  party,
  entry,
}) {
  const data =
    buildBillData({
      type,
      party,
      entry,
    });

  const buffer =
    await fillTemplate(data);

  const fileBase =
    data.isService
      ? `Service-Receipt-${
          data.invoiceNo ||
          "SL"
        }`.replace(
          /[^\w.-]+/g,
          "-",
        )
      : `Invoice-${
          data.invoiceNo ||
          String(
            entry?._id || "",
          ).slice(-8)
        }`.replace(
          /[^\w.-]+/g,
          "-",
        );

  return {
    buffer,

    fileName:
      `${fileBase}.docx`,

    data,
  };
}

// ============================================================
// EXPORTS
// ============================================================

module.exports = {
  generateBillDocx,
  buildBillData,
  amountInWords,
};