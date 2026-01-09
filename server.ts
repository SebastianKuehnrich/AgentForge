// =============================================================================
// SERVER.TS - EXPRESS BACKEND FOR AI MULTI-TOOL AGENT
// =============================================================================

import { config } from 'dotenv';
config();

import express, { Request, Response } from 'express';
import { z } from "zod";
import OpenAI from "openai";
import path from "path";
import { fileURLToPath } from 'url';
import { encoding_for_model } from "tiktoken";

// =============================================================================
// SETUP
// =============================================================================

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.static('public'));

// OpenAI Setup
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY
});

const tokenEncoder = encoding_for_model("gpt-4o-mini");

function countTokens(text: string): number {
    try {
        const tokens = tokenEncoder.encode(text);
        return tokens.length;
    } catch (e) {
        return Math.ceil(text.length / 4);
    }
}

// =============================================================================
// ERROR HANDLING UTILITIES
// =============================================================================

async function callLLMWithRetry(
    apiCall: () => Promise<string>,
    maxRetries: number = 3
): Promise<string> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await apiCall();
        } catch (error: any) {
            const isLastAttempt = attempt === maxRetries;

            if (error.status === 429 && !isLastAttempt) {
                const waitTime = 1000 * Math.pow(2, attempt - 1);
                console.log(`[RETRY] Rate limit. Waiting ${waitTime}ms...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                continue;
            }

            if ((error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') && !isLastAttempt) {
                console.log(`[RETRY] Network error. Retry ${attempt}/${maxRetries}...`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                continue;
            }

            throw error;
        }
    }

    throw new Error(`Max retries exceeded`);
}

function parseToolCallWithRecovery(content: string): any | null {
    const toolMatch = content.match(/\{[\s\S]*"tool"[\s\S]*\}/);
    if (!toolMatch) return null;

    const rawJson = toolMatch[0];

    try {
        return JSON.parse(rawJson);
    } catch (e) {
        try {
            let fixed = rawJson
                .replace(/'/g, '"')
                .replace(/([{,]\s*)(\w+):/g, '$1"$2":')
                .replace(/,(\s*[}\]])/g, '$1');

            return JSON.parse(fixed);
        } catch (e2) {
            return null;
        }
    }
}

// =============================================================================
// TOOLS DEFINITION
// =============================================================================

const calculatorTool = {
    name: "calculator",
    description: "Führt mathematische Berechnungen durch.",
    schema: z.object({
        expression: z.string()
    }),
    execute: async (params: { expression: string }) => {
        try {
            const result = Function(`"use strict"; return (${params.expression})`)();
            return { success: true, result };
        } catch (e) {
            return { success: false, error: "Ungültiger Ausdruck" };
        }
    }
};

const timeTool = {
    name: "current_time",
    description: "Gibt aktuelle Uhrzeit und Datum zurück.",
    schema: z.object({}),
    execute: async () => {
        return {
            success: true,
            time: new Date().toLocaleTimeString("de-DE"),
            date: new Date().toLocaleDateString("de-DE")
        };
    }
};

const diceRollTool = {
    name: "dice_roll",
    description: "Würfelt einen Würfel.",
    schema: z.object({
        sides: z.number().min(2).max(100).default(6)
    }),
    execute: async (params: { sides: number }) => {
        const result = Math.floor(Math.random() * params.sides) + 1;
        return { success: true, result, sides: params.sides };
    }
};

const coinFlipTool = {
    name: "coin_flip",
    description: "Wirft eine Münze.",
    schema: z.object({}),
    execute: async () => {
        const result = Math.random() < 0.5 ? "Kopf" : "Zahl";
        return { success: true, result };
    }
};

const randomNumberTool = {
    name: "random_number",
    description: "Generiert eine Zufallszahl zwischen min und max.",
    schema: z.object({
        min: z.number(),
        max: z.number()
    }),
    execute: async (params: { min: number; max: number }) => {
        if (params.min > params.max) {
            return { success: false, error: "min muss kleiner als max sein" };
        }
        const result = Math.floor(Math.random() * (params.max - params.min + 1)) + params.min;
        return { success: true, result, range: `${params.min}-${params.max}` };
    }
};

const bmiCalculatorTool = {
    name: "bmi_calculator",
    description: "Berechnet den Body Mass Index (BMI).",
    schema: z.object({
        weightKg: z.number().positive(),
        heightCm: z.number().positive().min(50).max(250)
    }),
    execute: async (params: { weightKg: number; heightCm: number }) => {
        const heightM = params.heightCm / 100;
        const bmi = params.weightKg / (heightM * heightM);
        const bmiRounded = Math.round(bmi * 10) / 10;

        let category = "";
        if (bmi < 18.5) category = "Untergewicht";
        else if (bmi < 25) category = "Normalgewicht";
        else if (bmi < 30) category = "Übergewicht";
        else category = "Adipositas";

        return {
            success: true,
            weight: params.weightKg,
            height: params.heightCm,
            bmi: bmiRounded,
            category
        };
    }
};

const passwordGeneratorTool = {
    name: "password_generator",
    description: "Generiert ein sicheres Passwort.",
    schema: z.object({
        length: z.number().int().min(8).max(64).default(16),
        includeSymbols: z.boolean().default(true)
    }),
    execute: async (params: { length: number; includeSymbols: boolean }) => {
        const lowercase = "abcdefghijklmnopqrstuvwxyz";
        const uppercase = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
        const numbers = "0123456789";
        const symbols = "!@#$%^&*()_+-=[]{}|;:,.<>?";

        let charset = lowercase + uppercase + numbers;
        if (params.includeSymbols) charset += symbols;

        let password = "";
        for (let i = 0; i < params.length; i++) {
            password += charset[Math.floor(Math.random() * charset.length)];
        }

        return {
            success: true,
            password,
            length: params.length,
            includesSymbols: params.includeSymbols
        };
    }
};

const ageCalculatorTool = {
    name: "age_calculator",
    description: "Berechnet das Alter aus einem Geburtsdatum.",
    schema: z.object({
        birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
    }),
    execute: async (params: { birthDate: string }) => {
        const birth = new Date(params.birthDate);
        const now = new Date();

        if (isNaN(birth.getTime())) {
            return { success: false, error: "Ungültiges Datum" };
        }

        if (birth > now) {
            return { success: false, error: "Geburtsdatum liegt in der Zukunft" };
        }

        let years = now.getFullYear() - birth.getFullYear();
        let months = now.getMonth() - birth.getMonth();
        let days = now.getDate() - birth.getDate();

        if (days < 0) {
            months--;
            const lastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
            days += lastMonth.getDate();
        }

        if (months < 0) {
            years--;
            months += 12;
        }

        return {
            success: true,
            birthDate: params.birthDate,
            years,
            months,
            days
        };
    }
};

const weatherTool = {
    name: "weather",
    description: "Ruft aktuelles Wetter für eine Stadt ab.",
    schema: z.object({
        city: z.string().min(2),
        countryCode: z.string().length(2).optional()
    }),
    execute: async (params: { city: string; countryCode?: string }) => {
        const API_KEY = process.env.OPENWEATHER_API_KEY;

        if (!API_KEY) {
            return {
                success: false,
                error: "API Key nicht konfiguriert"
            };
        }

        try {
            const location = params.countryCode
                ? `${params.city},${params.countryCode}`
                : params.city;

            const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(location)}&appid=${API_KEY}&units=metric&lang=de`;

            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), 5000);

            const response = await fetch(url, { signal: controller.signal });
            clearTimeout(timeout);

            if (!response.ok) {
                if (response.status === 404) {
                    return { success: false, error: `Stadt "${params.city}" nicht gefunden` };
                }
                return { success: false, error: `API Error: ${response.status}` };
            }

            const data = await response.json();

            return {
                success: true,
                city: data.name,
                country: data.sys.country,
                temperature: Math.round(data.main.temp),
                feelsLike: Math.round(data.main.feels_like),
                description: data.weather[0].description,
                humidity: data.main.humidity,
                windSpeed: Math.round(data.wind.speed * 10) / 10
            };

        } catch (error: any) {
            if (error.name === 'AbortError') {
                return { success: false, error: "API Timeout" };
            }
            return { success: false, error: `Network Error: ${error.message}` };
        }
    }
};

const vatCalculatorTool = {
    name: "vat_calculator",
    description: "Berechnet Mehrwertsteuer für verschiedene Länder.",
    schema: z.object({
        amount: z.number().positive(),
        country: z.enum(["DE", "AT", "CH"]),
        direction: z.enum(["add", "remove"]).default("add")
    }),
    execute: async (params: { amount: number; country: string; direction: string }) => {
        const vatRates: Record<string, { rate: number; name: string }> = {
            DE: { rate: 19, name: "Deutschland" },
            AT: { rate: 20, name: "Österreich" },
            CH: { rate: 7.7, name: "Schweiz" }
        };

        const countryInfo = vatRates[params.country];
        const vatRate = countryInfo.rate;

        let netAmount: number;
        let grossAmount: number;
        let vatAmount: number;

        if (params.direction === "add") {
            netAmount = params.amount;
            vatAmount = netAmount * (vatRate / 100);
            grossAmount = netAmount + vatAmount;
        } else {
            grossAmount = params.amount;
            netAmount = grossAmount / (1 + vatRate / 100);
            vatAmount = grossAmount - netAmount;
        }

        return {
            success: true,
            country: params.country,
            countryName: countryInfo.name,
            vatRate,
            direction: params.direction === "add" ? "Netto → Brutto" : "Brutto → Netto",
            netAmount: Math.round(netAmount * 100) / 100,
            vatAmount: Math.round(vatAmount * 100) / 100,
            grossAmount: Math.round(grossAmount * 100) / 100
        };
    }
};

const jsonValidatorTool = {
    name: "json_validator",
    description: "Validiert JSON Strings.",
    schema: z.object({
        jsonString: z.string().max(10000),
        prettyPrint: z.boolean().default(false)
    }),
    execute: async (params: { jsonString: string; prettyPrint: boolean }) => {
        try {
            const parsed = JSON.parse(params.jsonString);

            let jsonType = typeof parsed;
            if (Array.isArray(parsed)) jsonType = "array";
            else if (parsed === null) jsonType = "null";

            let itemCount = 0;
            if (jsonType === "array") itemCount = parsed.length;
            else if (jsonType === "object") itemCount = Object.keys(parsed).length;

            return {
                success: true,
                valid: true,
                type: jsonType,
                itemCount,
                message: "JSON ist gültig"
            };

        } catch (error: any) {
            return {
                success: false,
                valid: false,
                error: error.message,
                message: "JSON ist ungültig"
            };
        }
    }
};

const allTools = [
    calculatorTool,
    timeTool,
    randomNumberTool,
    diceRollTool,
    coinFlipTool,
    bmiCalculatorTool,
    passwordGeneratorTool,
    ageCalculatorTool,
    weatherTool,
    vatCalculatorTool,
    jsonValidatorTool
];

// =============================================================================
// SYSTEM PROMPT
// =============================================================================

const SYSTEM_PROMPT = `
Du bist ein hilfreicher Assistent mit Zugriff auf 11 verschiedene Tools.

VERFÜGBARE TOOLS:
${allTools.map(t => `- ${t.name}: ${t.description}`).join("\n")}

REGELN:
1. Nutze Tools wenn nötig
2. Antworte auf Deutsch
3. Sei präzise und freundlich

Wenn du ein Tool nutzen willst, antworte NUR mit JSON:
{"tool": "tool_name", "params": {...}}

WICHTIGE BEISPIELE:
- Calculator: {"tool": "calculator", "params": {"expression": "10 + 10"}}
- Weather: {"tool": "weather", "params": {"city": "Berlin", "countryCode": "DE"}}
- VAT: {"tool": "vat_calculator", "params": {"amount": 100, "country": "DE", "direction": "add"}}
- JSON: {"tool": "json_validator", "params": {"jsonString": "{\\"key\\": \\"value\\"}", "prettyPrint": true}}
- BMI: {"tool": "bmi_calculator", "params": {"weightKg": 75, "heightCm": 180}}
- Password: {"tool": "password_generator", "params": {"length": 16, "includeSymbols": true}}
- Age: {"tool": "age_calculator", "params": {"birthDate": "1990-05-15"}}

Wenn du fertig bist, antworte normal OHNE JSON.
`;

// =============================================================================
// AGENT LOGIC
// =============================================================================

async function processMessage(userMessage: string): Promise<{
    response: string;
    toolsUsed: string[];
    cost: number;
    tokens: number;
}> {
    const history: string[] = [SYSTEM_PROMPT, `User: ${userMessage}`];
    const toolsUsed: string[] = [];
    let totalTokens = 0;
    let totalCost = 0;

    const MAX_ITERATIONS = 5;
    let iterations = 0;
    let answered = false;
    let finalResponse = "";

    while (iterations < MAX_ITERATIONS && !answered) {
        iterations++;

        const prompt = history.join("\n\n");
        const promptTokens = countTokens(prompt);

        let content: string;
        try {
            content = await callLLMWithRetry(async () => {
                const apiResponse = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    messages: [{ role: "user", content: prompt }],
                    temperature: 0.7
                });

                if (apiResponse.usage) {
                    totalTokens += apiResponse.usage.total_tokens;
                    totalCost += apiResponse.usage.total_tokens * 0.00000015;
                }

                return apiResponse.choices[0].message.content || "";
            });
        } catch (error: any) {
            console.error(`[ERROR] LLM call failed:`, error.message);
            return {
                response: `Error: ${error.message}`,
                toolsUsed: [],
                cost: 0,
                tokens: 0
            };
        }

        const toolCall = parseToolCallWithRecovery(content);

        if (toolCall) {
            console.log(`[TOOL] Attempting: ${toolCall.tool}`);

            const tool = allTools.find(t => t.name === toolCall.tool);
            if (!tool) {
                history.push(`Assistant: ${content}`);
                history.push(`User: Error: Tool "${toolCall.tool}" not found.`);
                continue;
            }

            const validation = tool.schema.safeParse(toolCall.params);
            if (!validation.success) {
                const errors = validation.error.issues.map(i => i.message).join(", ");
                history.push(`Assistant: ${content}`);
                history.push(`User: Error: Invalid parameters: ${errors}`);
                continue;
            }

            try {
                const toolResult = await tool.execute(validation.data);

                if (!toolResult.success) {
                    history.push(`Assistant: ${content}`);
                    history.push(`User: Tool Error: ${toolResult.error}`);
                    continue;
                }

                toolsUsed.push(tool.name);
                history.push(`Assistant: ${content}`);
                history.push(`User: Tool Result: ${JSON.stringify(toolResult)}`);
            } catch (error: any) {
                history.push(`Assistant: ${content}`);
                history.push(`User: Tool execution failed: ${error.message}`);
                continue;
            }

        } else {
            finalResponse = content;
            answered = true;
        }
    }

    if (!answered) {
        finalResponse = "Sorry, I couldn't complete the request within the iteration limit.";
    }

    return {
        response: finalResponse,
        toolsUsed: Array.from(new Set(toolsUsed)),
        cost: totalCost,
        tokens: totalTokens
    };
}

// =============================================================================
// ROUTES
// =============================================================================

// Health check
app.get('/health', (req: Request, res: Response) => {
    res.json({
        status: 'ok',
        tools: allTools.length,
        timestamp: new Date().toISOString()
    });
});

// Chat endpoint
app.post('/api/chat', async (req: Request, res: Response) => {
    try {
        const { message } = req.body;

        if (!message || typeof message !== 'string') {
            return res.status(400).json({
                error: 'Message is required and must be a string'
            });
        }

        console.log(`[REQUEST] User: ${message.substring(0, 50)}...`);

        const result = await processMessage(message);

        console.log(`[RESPONSE] Tools used: ${result.toolsUsed.join(', ')}`);
        console.log(`[COST] $${result.cost.toFixed(6)} (${result.tokens} tokens)`);

        res.json(result);

    } catch (error: any) {
        console.error('[ERROR]', error);
        res.status(500).json({
            error: error.message || 'Internal server error',
            toolsUsed: [],
            cost: 0,
            tokens: 0
        });
    }
});

// Serve index.html for all other routes
app.get('*', (req: Request, res: Response) => {
    res.sendFile(path.join(process.cwd(), 'public', 'index.html'));
});

// =============================================================================
// START SERVER
// =============================================================================

app.listen(PORT, () => {
    console.log('\n' + '='.repeat(60));
    console.log('🚀 AI MULTI-TOOL AGENT SERVER');
    console.log('='.repeat(60));
    console.log(`📡 Server running on: http://localhost:${PORT}`);
    console.log(`🛠️  Tools available: ${allTools.length}`);
    console.log(`🔑 OpenAI API: ${process.env.OPENAI_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log(`🌤️  Weather API: ${process.env.OPENWEATHER_API_KEY ? '✓ Configured' : '✗ Missing'}`);
    console.log('='.repeat(60) + '\n');
});