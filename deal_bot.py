import discord
from discord.ext import commands
import json
import urllib.request

import os
from dotenv import load_dotenv

load_dotenv()

# --- TOKENS (Loaded from environment variables) ---
DISCORD_TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

# System prompt giving the AI its role and context
SYSTEM_PROMPT = """You are DealSense AI, an expert AI partner and deal intelligence analyst working alongside Gursher (Project Lead) and Denny (Core Team).
Your domain is affiliate marketing, e-commerce deal flow, market intelligence, scraping data, price tracking, and project execution.
Be direct, smart, concise, and helpful. Format messages nicely with Discord markdown."""

intents = discord.Intents.default()
intents.message_content = True
bot = commands.Bot(command_prefix="!", intents=intents)

# Conversation history per channel
chat_histories = {}

def ask_gemini(user_name, message_text, history):
    if not GEMINI_API_KEY or GEMINI_API_KEY == "PASTE_YOUR_GEMINI_API_KEY_HERE":
        return f"Hey {user_name}! Please add your Gemini API key in `deal_bot.py` so I can think and talk like a real AI."

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key={GEMINI_API_KEY}"
    
    # Build contents with context
    contents = [{"role": "user", "parts": [{"text": SYSTEM_PROMPT}]}]
    for role, text in history[-6:]:  # Keep last 6 exchanges for context
        contents.append({"role": role, "parts": [{"text": text}]})
    contents.append({"role": "user", "parts": [{"text": f"[{user_name}]: {message_text}"}]})

    payload = json.dumps({"contents": contents}).encode("utf-8")
    req = urllib.request.Request(url, data=payload, headers={"Content-Type": "application/json"})

    try:
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            reply = data["candidates"][0]["content"]["parts"][0]["text"]
            return reply
    except Exception as e:
        return f"⚠️ Error contacting AI brain: {e}"

@bot.event
async def on_ready():
    print(f"🤖 DealSense AI is fully ONLINE as {bot.user}!")
    await bot.change_presence(activity=discord.Activity(type=discord.ActivityType.watching, name="Deal Intelligence"))

@bot.event
async def on_message(message):
    if message.author == bot.user:
        return

    # Trigger when mentioned or in #ai-assistant
    if bot.user.mentioned_in(message) or message.channel.name == "ai-assistant":
        user_name = message.author.display_name
        clean_text = message.clean_content.replace(f"@{bot.user.name}", "").strip()

        if not clean_text:
            await message.reply(f"Hey {user_name}! How can I help you and Denny with Deal Intelligence today?")
            return

        async with message.channel.typing():
            ch_id = message.channel.id
            if ch_id not in chat_histories:
                chat_histories[ch_id] = []

            ai_response = ask_gemini(user_name, clean_text, chat_histories[ch_id])

            # Update history
            chat_histories[ch_id].append(("user", f"{user_name}: {clean_text}"))
            chat_histories[ch_id].append(("model", ai_response))

            # Send response (handle Discord 2000 char limit)
            if len(ai_response) > 1950:
                for chunk in [ai_response[i:i+1900] for i in range(0, len(ai_response), 1900)]:
                    await message.reply(chunk)
            else:
                await message.reply(ai_response)

    await bot.process_commands(message)

if __name__ == "__main__":
    bot.run(DISCORD_TOKEN)