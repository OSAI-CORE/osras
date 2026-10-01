const MODEL =
    "gemini-2.5-flash-lite";


/*
 * =====================================================
 * OSRAS Smart Assist
 * Google Search Grounding 證據整理
 * =====================================================
 */
function extractGroundingEvidence(
    data
) {

    const candidate =
        data?.candidates?.[0] || {};

    const metadata =
        candidate?.groundingMetadata || {};

    const searchQueries =
        Array.isArray(
            metadata?.webSearchQueries
        )
            ? metadata.webSearchQueries
            : [];


    const sourceMap =
        new Map();


    const groundingChunks =
        Array.isArray(
            metadata?.groundingChunks
        )
            ? metadata.groundingChunks
            : [];


    groundingChunks.forEach(
        chunk => {

            const web =
                chunk?.web;

            if (
                !web?.uri
            ) {
                return;
            }


            if (
                sourceMap.has(
                    web.uri
                )
            ) {
                return;
            }


            sourceMap.set(
                web.uri,
                {
                    title:
                        String(
                            web.title || ""
                        ),

                    uri:
                        String(
                            web.uri || ""
                        )
                }
            );
        }
    );


    return {
        searched:
            searchQueries.length > 0 ||
            sourceMap.size > 0,

        searchQueries,

        sources:
            Array.from(
                sourceMap.values()
            )
    };
}

export default async function handler(
    req,
    res
) {

    /*
     * =====================================================
     * OSRAS Smart Assist CORS
     *
     * Vercel Environment Variables：
     *
     * OSRAS_ALLOWED_ORIGINS
     *
     * 多個網址使用逗號分隔。
     * =====================================================
     */
    const allowedOrigins =
        String(
            process.env
                .OSRAS_ALLOWED_ORIGINS ||
            ""
        )
            .split(",")
            .map(
                value =>
                    value.trim()
            )
            .filter(Boolean);


    const requestOrigin =
        String(
            req.headers.origin || ""
        ).trim();


    const originAllowed =
        !requestOrigin ||
        allowedOrigins.includes(
            requestOrigin
        );


    if (
        requestOrigin &&
        originAllowed
    ) {

        res.setHeader(
            "Access-Control-Allow-Origin",
            requestOrigin
        );

        res.setHeader(
            "Vary",
            "Origin"
        );
    }


    res.setHeader(
        "Access-Control-Allow-Methods",
        "POST, OPTIONS"
    );


    res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type"
    );


    if (
        req.method === "OPTIONS"
    ) {

        return res
            .status(204)
            .end();
    }


    if (
        requestOrigin &&
        !originAllowed
    ) {

        return res.status(403).json({
            error:
                "Origin not allowed"
        });
    }


    if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed"
    });
  }

  try {
    const body =
      typeof req.body === "string"
        ? JSON.parse(req.body || "{}")
        : req.body || {};

    const action = String(body.action || "").trim();

    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({
        error: "缺少 GEMINI_API_KEY，請到 Vercel Environment Variables 設定"
      });
    }

    if (!action) {
      return res.status(400).json({
        error: "缺少 action，可用值：generateRow / controlProposal / audit",
        receivedBody: body
      });
    }

    let prompt = "";

if (action === "generateRow") {

    const jobTitle =
        String(
            body.jobTitle || ""
        ).trim();


    const localDraft =
        body.localDraft &&
        typeof body.localDraft === "object"
            ? body.localDraft
            : null;

      if (!jobTitle) {
        return res.status(400).json({
          error: "缺少 jobTitle"
        });
      }

prompt = `你是一位專業 ISO 45001 職業安全衛生管理師、
風險評估專家與台灣職業安全衛生法規查核專家。

作業名稱：
「${jobTitle}」

以下為 OSRAS Local Intelligence Core
依本地資料庫、風險規則、資格規則與 Dynamic Fallback
產生的初步結果：

${localDraft
    ? JSON.stringify(localDraft)
    : "目前沒有本地初稿"}

你的角色不是重新從零生成，
而是利用 Google Search 進行「查證、比對與必要補強」。

【重要原則】

1. Local Core 為第一層結果。
2. 搜尋只負責修正明確錯誤或補充有可靠依據的內容。
3. 不得僅因搜尋到相似案例，就假設本作業具有相同設備容量、
   電壓、化學品濃度、作業高度、設備型式或現場控制。
4. 無法由作業名稱或搜尋資料確認的現場事實，不得自行杜撰。
5. 法定資格、證照、作業主管或訓練：
   只有適用條件相對明確時才能直接判定。
6. 若法定資格仍取決於設備容量、荷重、型式、材質、
   電壓、能量或其他現場條件，checked 必須維持 false。
7. 搜尋法規時優先採用台灣政府、法規資料庫、
   勞動部及職業安全衛生相關官方來源。
8. 不確定法條或條號時，不得猜測。
9. S、P 僅限 1 至 4。
10. 控制措施固定使用五個控制層級：
    消除、取代、工程控制、管理控制、個人防護具。
11. 不得因加入 PPE 就不合理大幅降低風險。

請輸出修正後完整資料。

只輸出純 JSON，不要 markdown、不要說明文字。

{
  "job_title": "${jobTitle}",
  "cycle": "經常性或非經常性",
  "environment": "作業環境",
  "machinery": "機械／設備",
  "chemical": "能源／化學品",

  "qualification": {
    "checked": false,
    "license": "法定資格、必要訓練或相關訓練名稱；沒有則填無",
    "requirementType": "qualification / training / mandatory-training / conditional-statutory / none"
  },

  "hazard_type": "主要危害類型",

  "scenario": "事故可能造成之自然敘述情境",

  "existing_eng": "現有工程控制",
  "existing_admin": "現有管理控制",
  "existing_ppe": "現有個人防護具",

  "severity_1": 1,
  "probability_1": 1,

  "control_proposal": "消除：...\\n取代：...\\n工程控制：...\\n管理控制：...\\n個人防護具：...",

  "severity_2": 1,
  "probability_2": 1
}`;
    }

    else if (action === "controlProposal") {
      const row = body.row || {};

      if (!row.job_title) {
        return res.status(400).json({
          error: "缺少 row.job_title",
          receivedRow: row
        });
      }

      prompt = `你是一位專業職業安全工程師與 ISO 45001 風險控制專家。

請根據以下職安風險評估資料，產生符合 Hierarchy of Controls 的降低風險控制措施。

請注意：
1. 優先考量消除、取代、工程控制。
2. 不可只用 PPE 就大幅降低風險。
3. 控制後嚴重度 severity_2 與可能性 probability_2 必須合理。
4. 嚴重度與可能性只能是 1-4 的整數。
5. 必須依序評估：
   消除 → 取代 → 工程控制 → 管理控制 → 個人防護具。

6. 若消除或取代依目前資料無法確認可行，
   可以說明評估方向，但不得虛構現場可以直接採行。

7. 請使用 Google Search 查證設備安全控制、
   專業作法及必要法規背景。

8. 網路搜尋結果只能作為補強依據，
   不得取代目前 row 中已確認的現場資料。

待分析資料：
${JSON.stringify(row)}

請只輸出純 JSON，不要 markdown，不要說明文字。

JSON 格式如下：
{
  "control_proposal": "消除：...\\n取代：...\\n工程控制：...\\n管理控制：...\\n個人防護具：...",
  "severity_2": 1,
  "probability_2": 1,
  "reason": "簡短說明為何如此調整控制後風險"
}`;
    }

    else if (action === "audit") {
      const rows = Array.isArray(body.rows) ? body.rows : [];

      if (rows.length === 0) {
        return res.status(400).json({
          error: "缺少 rows，或 rows 為空陣列"
        });
      }

      prompt = `你是一位極度嚴謹的 ISO 45001 與台灣職業安全衛生法規稽核專家。

請對以下職業安全危害辨識與風險評估表進行深度稽核。

稽核重點：
1. 作業名稱、危害類型、事故情境是否合理。
2. 嚴重度 S 與可能性 P 是否低估。
3. 初始高風險或重大風險是否有足夠控制措施。
4. 控制措施是否符合 Hierarchy of Controls。
5. 是否過度依賴 PPE。
6. 控制後風險是否不合理下降。
7. 是否遺漏法定證照或特殊作業資格。
8. 是否有法規適用或違反疑慮。
9. 若資料本身沒有明顯錯誤，
   只是設備容量、荷重、型式、電壓、材質、
   化學品條件或現場配置尚未提供，
   不得列為 warning 或 critical。

10. 上述情形使用：
    level = "info"
    type = "現場條件確認"

11. 只有現有資料已足以證明法定要求適用，
    而目前內容明顯錯誤、缺漏或矛盾時，
    才列為 warning。

12. 搜尋到的法規或網路資料，
    若仍無法證明本案現場條件符合適用門檻，
    不得據此直接判定缺失。

待稽核資料：
${JSON.stringify(rows)}

請只輸出純 JSON 陣列，不要 markdown，不要說明文字。

JSON 格式如下：
[
  {
    "rowId": "項次",
    "level": "critical/warning/info/success",
    "type": "缺失類別",
    "msg": "風險與問題說明",
    "suggestion": "具體改善建議",
    "regulation": "可能適用法規，若無則填無"
  }
]

若完全沒有問題，請回傳：
[
  {
    "rowId": "All",
    "level": "success",
    "type": "審查通過",
    "msg": "未發現明顯邏輯瑕疵",
    "suggestion": "",
    "regulation": "無"
  }
]`;
    }

    else {
      return res.status(400).json({
        error: "不支援的 action",
        allowedActions: ["generateRow", "controlProposal", "audit"]
      });
    }

const payload = {

    contents: [
        {
            role:
                "user",

            parts: [
                {
                    text:
                        prompt
                }
            ]
        }
    ],


    /*
     * Gemini Google Search Grounding
     *
     * 模型會自行判斷是否需要搜尋，
     * 不代表每次一定發出搜尋查詢。
     */
    tools: [
        {
            google_search: {}
        }
    ],


generationConfig: {

    temperature:
        0.2,

    maxOutputTokens:
        action === "audit"
            ? 4096
            : 3072
}
};

const response = await fetch(
  `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`,
  {
    method:
      "POST",

    headers: {
      "Content-Type":
        "application/json",

      "x-goog-api-key":
        process.env.GEMINI_API_KEY
    },

    body:
      JSON.stringify(
        payload
      )
  }
);

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API Error:", JSON.stringify(data, null, 2));

      return res.status(response.status).json({
        error: data.error || data,
        model: MODEL
      });
    }

let rawText =
    (
        data
            ?.candidates
            ?.[0]
            ?.content
            ?.parts || []
    )
        .map(
            part =>
                typeof part?.text === "string"
                    ? part.text
                    : ""
        )
        .join("")
        .trim();


rawText = rawText
    .replace(
        /```json/gi,
        ""
    )
    .replace(
        /```/g,
        ""
    )
    .trim();


if (
    !rawText
) {

    return res.status(502).json({
        error:
            "AI 未回傳可解析的文字內容",

        model:
            MODEL,

        grounding:
            extractGroundingEvidence(
                data
            )
    });
}

    let result;

    try {
      result = JSON.parse(rawText);
    } catch (parseError) {
      return res.status(500).json({
        error: "AI 回傳 JSON 解析失敗",
        rawText,
        model: MODEL
      });
    }

const grounding =
    extractGroundingEvidence(
        data
    );


return res.status(200).json({

    ok:
        true,

    action,

    model:
        MODEL,

    result,

    grounding
});
  } catch (error) {
    console.error("Server Error:", error);

    return res.status(500).json({
      error: error.message,
      model: MODEL
    });
  }
}
