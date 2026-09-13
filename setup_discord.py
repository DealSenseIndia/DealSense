import json
import time
import urllib.request
import urllib.error

import os
from dotenv import load_dotenv

load_dotenv()

# --- CONFIGURATION (Loaded from environment variables) ---
TOKEN = os.environ.get("DISCORD_BOT_TOKEN", "")
GUILD_ID = os.environ.get("DISCORD_GUILD_ID", "1548683825629110334")
DENNY_USERNAME = "venkybeast"

HEADERS = {
    "Authorization": f"Bot {TOKEN}",
    "Content-Type": "application/json",
    "User-Agent": "DiscordBot (https://discord.com, 1.0)",
}

def api(path, method="GET", data=None):
    url = f"https://discord.com/api/v10{path}"
    body = json.dumps(data).encode("utf-8") if data is not None else None
    req = urllib.request.Request(url, data=body, headers=HEADERS, method=method)
    try:
        with urllib.request.urlopen(req) as resp:
            if resp.status in (200, 201):
                return json.loads(resp.read().decode("utf-8"))
            return True
    except urllib.error.HTTPError as e:
        err = e.read().decode("utf-8")
        print(f"❌ API Error [{method} {path}]: {e.code} - {err}")
        return None
    except Exception as e:
        print(f"❌ Request error: {e}")
        return None

def create_role(name, color, hoist=True):
    print(f"👑 Creating role: {name}...")
    res = api(f"/guilds/{GUILD_ID}/roles", method="POST", data={
        "name": name,
        "color": color,
        "hoist": hoist,
        "mentionable": True
    })
    time.sleep(0.4)
    return res.get("id") if res else None

def create_category(name):
    print(f"\n📁 Creating Category: {name}")
    res = api(f"/guilds/{GUILD_ID}/channels", method="POST", data={
        "name": name,
        "type": 4  # GUILD_CATEGORY
    })
    time.sleep(0.4)
    return res.get("id") if res else None

def create_channel(name, parent_id=None, ctype=0, topic=None):
    icon = "🔊" if ctype == 2 else "💬"
    print(f"  {icon} Creating channel: #{name}")
    payload = {"name": name, "type": ctype}
    if parent_id:
        payload["parent_id"] = parent_id
    if topic:
        payload["topic"] = topic
    res = api(f"/guilds/{GUILD_ID}/channels", method="POST", data=payload)
    time.sleep(0.4)
    return res.get("id") if res else None

def send_embed(channel_id, embed):
    api(f"/channels/{channel_id}/messages", method="POST", data={"embeds": [embed]})
    time.sleep(0.4)

def main():
    print("=" * 60)
    print("🚀 BUILDING DEAL INTELLIGENCE DISCORD SERVER...")
    print("=" * 60)

    # 1. Verify Bot & Server
    guild = api(f"/guilds/{GUILD_ID}")
    if not guild:
        print("❌ Could not connect to the server. Check bot permissions!")
        return
    print(f" Connected to Server: {guild.get('name')}\n")

    # 2. Create Roles
    roles = {
        "lead": create_role("👑 Project Lead", 0xF1C40F),       # Gold
        "core": create_role("🚀 Core Team", 0x00BCD4),          # Cyan
        "ai": create_role("🤖 DealSense AI", 0x9B59B6),         # Purple
        "collab": create_role("👥 Collaborator", 0x2ECC71)      # Green
    }

    # 3. Try to assign Denny's role
    print(f"\n🔍 Searching for Denny (@{DENNY_USERNAME})...")
    members = api(f"/guilds/{GUILD_ID}/members/search?query={DENNY_USERNAME}")
    if members and len(members) > 0:
        denny_id = members[0]["user"]["id"]
        if roles["core"]:
            api(f"/guilds/{GUILD_ID}/members/{denny_id}/roles/{roles['core']}", method="PUT")
            print(f"✅ Assigned '🚀 Core Team' role to {DENNY_USERNAME}!")
    else:
        print(f"ℹ️ {DENNY_USERNAME} hasn't joined yet. The role will be ready for him once he joins.")

    # 4. Build Structure
    # Category 1: INFORMATION & ROADMAP
    cat_info = create_category("📌 INFORMATION & ROADMAP")
    ch_announcements = create_channel("announcements", cat_info, topic="Important project milestones and announcements")
    ch_scope = create_channel("project-scope", cat_info, topic="Deal Intelligence mission, roadmap, and architecture")
    ch_tasks = create_channel("task-board", cat_info, topic="Sprint goals, priority to-dos, and assignments")

    # Category 2: TEAM COLLABORATION
    cat_collab = create_category("💬 TEAM COLLABORATION")
    ch_general = create_channel("general-chat", cat_collab, topic="General team discussion and banter")
    ch_brainstorm = create_channel("brainstorming", cat_collab, topic="Affiliate strategies, idea pool, and feature concepts")
    ch_sync = create_channel("gursher-and-denny", cat_collab, topic="Private/direct focus sync between Gursher and Denny")

    # Category 3: DEAL INTELLIGENCE CORE
    cat_deals = create_category("📊 DEAL INTELLIGENCE")
    ch_deals = create_channel("deal-flow-pipeline", cat_deals, topic="Incoming affiliate deals, merchant programs, and offers")
    ch_signals = create_channel("market-signals", cat_deals, topic="Competitor intelligence, price drops, and industry signals")
    ch_pipeline = create_channel("data-pipelines", cat_deals, topic="Scraper status, data ingestion, and feeds")

    # Category 4: AI AGENT & AUTOMATION
    cat_ai = create_category("⚡ AI & AUTOMATION")
    ch_ai = create_channel("ai-assistant", cat_ai, topic="Direct chat and task execution with DealSense AI")
    ch_logs = create_channel("system-logs", cat_ai, topic="Automated health checks, error logs, and alerts")

    # Category 5: VOICE CHANNELS
    cat_voice = create_category("🎙️ VOICE ROOMS")
    create_channel("Team Huddle", cat_voice, ctype=2)
    create_channel("Work Jam", cat_voice, ctype=2)

    # 5. Post Welcome & Onboarding Embeds
    print("\n📝 Publishing initial project documentation embeds...")

    if ch_scope:
        send_embed(ch_scope, {
            "title": "🎯 Project Overview: Deal Intelligence",
            "description": "Welcome to the central command hub for the **Deal Intelligence / DealSense** initiative.\nThis server is organized for seamless execution between **Gursher**, **Denny**, and **DealSense AI**.",
            "color": 0x00BCD4,
            "fields": [
                {"name": "👥 Core Team", "value": "• **Gursher**: Project Lead & Strategy\n• **Denny**: Core Team / Operations\n• **DealSense AI**: Autonomous Research & Data Agent", "inline": False},
                {"name": "📌 Key Objectives", "value": "1. Aggregate & analyze high-yield affiliate opportunities.\n2. Automated market price and trend monitoring.\n3. Real-time deal alerts and intelligence scoring.", "inline": False},
                {"name": "⚡ How We Work", "value": "Drop ideas in `#brainstorming`, review active deals in `#deal-flow-pipeline`, and issue commands in `#ai-assistant`.", "inline": False}
            ],
            "footer": {"text": "Deal Intelligence Hub • Built automatically"}
        })

    if ch_announcements:
        send_embed(ch_announcements, {
            "title": "📢 Welcome Denny & Gursher!",
            "description": "The workspace structure is live and calibrated for the Deal Intelligence project.\n\nCheck out `#project-scope` for the layout or jump straight into `#general-chat` to kick off today's roadmap.",
            "color": 0xF1C40F
        })

    if ch_ai:
        send_embed(ch_ai, {
            "title": "🤖 DealSense AI Command Center",
            "description": "This channel is dedicated to AI-driven workflows.\n\nYou can prompt me for:\n• Market research & competitor deal analysis\n• Scraper & pipeline status updates\n• Drafting copy or affiliate partner outreach\n• Logging tasks into `#task-board`",
            "color": 0x9B59B6
        })

    print("\n" + "=" * 60)
    print("✅ DISCORD SERVER FULLY BUILT & CONFIGURED SUCCESSFULLY!")
    print("=" * 60)

if __name__ == "__main__":
    main()