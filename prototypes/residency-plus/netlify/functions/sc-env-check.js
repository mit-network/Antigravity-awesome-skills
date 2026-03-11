// Check environment version details
exports.handler = async () => {
    return {
        statusCode: 200,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
            status: "ready",
            node: process.version,
            fetch: typeof fetch !== "undefined"
        })
    };
};
