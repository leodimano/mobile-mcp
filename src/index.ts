#!/usr/bin/env node
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createMcpServer } from "./server";
import { error } from "./logger";
import { getConfig } from "./config";

async function main() {
	const transport = new StdioServerTransport();
	
	// Get configuration from environment variables or use defaults
	const config = getConfig();
	
	// Log the configuration
	error(`Starting mobile-mcp with configuration:
- iOS Devices: ${config.enableIosDevices ? "Enabled" : "Disabled"}
- iOS Simulators: ${config.enableIosSimulators ? "Enabled" : "Disabled"}
- Android Devices: ${config.enableAndroidDevices ? "Enabled" : "Disabled"}
- Android Emulators: ${config.enableAndroidEmulators ? "Enabled" : "Disabled"}`);

	const server = createMcpServer(config);
	await server.connect(transport);

	error("mobile-mcp server running on stdio");
}

main().catch(err => {
	console.error("Fatal error in main():", err);
	error("Fatal error in main(): " + JSON.stringify(err.stack));
	process.exit(1);
});
