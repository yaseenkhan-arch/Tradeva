import { emailLayout } from "./layout.js";
import { config } from "./config.js";

export function welcomeEmail({ name = "Trader" }) {
  return emailLayout({
    title: `Welcome to ${config.appName}!`,

    buttonText: "Open Dashboard",

    buttonUrl: `${config.appUrl}/dashboard.html`,

    content: `
      <p>Hi <strong>${name}</strong>,</p>

      <p>
        Welcome to <strong>${config.appName}</strong>.
      </p>

      <p>
        Your trading journal is now ready.
        Start tracking every trade, discover your edge,
        and improve with data instead of emotions.
      </p>

      <ul style="text-align:left;line-height:1.8;">
        <li>📈 Journal every trade</li>
        <li>📊 Analyze performance</li>
        <li>🧠 Improve trading psychology</li>
        <li>🎯 Build consistency over time</li>
      </ul>

      <p>
        We're excited to be part of your trading journey.
      </p>
    `
  });
}
