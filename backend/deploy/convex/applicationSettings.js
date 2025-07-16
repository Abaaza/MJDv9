"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCurrencySettings = exports.getAll = exports.upsert = exports.getByKeys = exports.getByKey = void 0;
const values_1 = require("convex/values");
const server_1 = require("./_generated/server");
exports.getByKey = (0, server_1.query)({
    args: { key: values_1.v.string() },
    handler: async (ctx, args) => {
        return await ctx.db
            .query("applicationSettings")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();
    },
});
exports.getByKeys = (0, server_1.query)({
    args: { keys: values_1.v.array(values_1.v.string()) },
    handler: async (ctx, args) => {
        const settings = await Promise.all(args.keys.map(key => ctx.db
            .query("applicationSettings")
            .withIndex("by_key", (q) => q.eq("key", key))
            .first()));
        return settings.filter(s => s !== null);
    },
});
exports.upsert = (0, server_1.mutation)({
    args: {
        key: values_1.v.string(),
        value: values_1.v.string(),
        description: values_1.v.optional(values_1.v.string()),
        userId: values_1.v.id("users"),
    },
    handler: async (ctx, args) => {
        const existing = await ctx.db
            .query("applicationSettings")
            .withIndex("by_key", (q) => q.eq("key", args.key))
            .first();
        if (existing) {
            await ctx.db.patch(existing._id, {
                value: args.value,
                description: args.description,
                updatedAt: Date.now(),
                updatedBy: args.userId,
            });
        }
        else {
            await ctx.db.insert("applicationSettings", {
                key: args.key,
                value: args.value,
                description: args.description,
                updatedAt: Date.now(),
                updatedBy: args.userId,
            });
        }
    },
});
exports.getAll = (0, server_1.query)({
    handler: async (ctx) => {
        return await ctx.db.query("applicationSettings").collect();
    },
});
exports.getCurrencySettings = (0, server_1.query)({
    handler: async (ctx) => {
        const currencySetting = await ctx.db
            .query("applicationSettings")
            .withIndex("by_key", (q) => q.eq("key", "CURRENCY"))
            .first();
        // Default to GBP (British Pound) if not set
        return {
            currency: (currencySetting === null || currencySetting === void 0 ? void 0 : currencySetting.value) || "GBP",
            symbol: getCurrencySymbol((currencySetting === null || currencySetting === void 0 ? void 0 : currencySetting.value) || "GBP")
        };
    },
});
// Helper function to get currency symbol
function getCurrencySymbol(currency) {
    const symbols = {
        GBP: "£",
        USD: "$",
        EUR: "€",
        JPY: "¥",
        CNY: "¥",
        INR: "₹",
        AUD: "A$",
        CAD: "C$",
        CHF: "CHF",
        HKD: "HK$",
        SGD: "S$",
        SEK: "kr",
        NOK: "kr",
        NZD: "NZ$",
        MXN: "$",
        ZAR: "R",
        BRL: "R$",
        RUB: "₽",
        KRW: "₩",
        TRY: "₺",
        AED: "د.إ",
        SAR: "﷼",
        PLN: "zł",
        THB: "฿",
        MYR: "RM",
        PHP: "₱",
        CZK: "Kč",
        HUF: "Ft",
        RON: "lei",
        DKK: "kr",
        ILS: "₪",
        CLP: "$",
        ARS: "$",
        COP: "$",
        PEN: "S/",
        UYU: "$",
        VND: "₫",
        UAH: "₴",
        GHS: "₵",
        KES: "KSh",
        NGN: "₦",
        EGP: "£",
        MAD: "د.م.",
        QAR: "﷼",
        KWD: "د.ك",
        BHD: "د.ب",
        OMR: "﷼"
    };
    return symbols[currency] || currency;
}
