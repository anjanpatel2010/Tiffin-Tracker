import subprocess
import os
import sys
from PIL import Image

TEMPLATES = [
    {
        "id": "1",
        "name": "uptodown_featured_image_1_daily_logger.png",
        "screenshot": "uptodown_screenshot_1_daily_logger.png",
        "badge": "TIFFIN TRACKER • MEAL LOGGER",
        "title_line1": "Log Daily Flat Meals",
        "title_accent": "in 1-Tap",
        "subtitle": "Track lunch & dinner portions, calculate daily cook billing, and sync meals across room phones without math errors.",
        "features": [
            "Half, Full & Special Meal Toggles",
            "Instant Multi-Device Flatmate Sync",
            "Real-Time Daily Cook Bill Calculation"
        ],
        "pill_top_text": "Paneer Butter Masala",
        "pill_top_tag": "SAVED",
        "pill_top_tag_color": "#00f5a0",
        "pill_bottom_text": "Alex's Day Bill",
        "pill_bottom_tag": "₹190",
        "pill_bottom_tag_color": "#00d4ff",
        "accent_gradient": "linear-gradient(135deg, #00f5a0 10%, #00d4ff 100%)",
        "glow1_color": "rgba(0, 245, 160, 0.18)",
        "glow2_color": "rgba(0, 212, 255, 0.16)",
        "phone_glow": "rgba(0, 245, 160, 0.22)"
    },
    {
        "id": "2",
        "name": "uptodown_featured_image_2_menu_poll.png",
        "screenshot": "uptodown_screenshot_2_menu_poll.png",
        "badge": "MENU POLLS • DEMOCRATIC KITCHEN",
        "title_line1": "Vote What to Cook",
        "title_accent": "for Dinner",
        "subtitle": "Launch live meal polls for your flatmates, track voting tallies in real-time, and forward the winning order to your cook via WhatsApp.",
        "features": [
            "Live Roommate Voting & Progress Bars",
            "1-Tap WhatsApp Order to Cook",
            "Zero Daily Cooking Confusion"
        ],
        "pill_top_text": "Dinner Poll Active",
        "pill_top_tag": "LIVE",
        "pill_top_tag_color": "#00f5a0",
        "pill_bottom_text": "Paneer Butter Masala",
        "pill_bottom_tag": "67% VOTES",
        "pill_bottom_tag_color": "#00d4ff",
        "accent_gradient": "linear-gradient(135deg, #00d4ff 10%, #a855f7 100%)",
        "glow1_color": "rgba(0, 212, 255, 0.20)",
        "glow2_color": "rgba(168, 85, 247, 0.18)",
        "phone_glow": "rgba(0, 212, 255, 0.24)"
    },
    {
        "id": "3",
        "name": "uptodown_featured_image_3_split_analytics.png",
        "screenshot": "uptodown_screenshot_4_split_analytics.png",
        "badge": "SPLIT EXPENSES • INSTANT UPI",
        "title_line1": "Fair Mess Split &",
        "title_accent": "Zero Meal Math",
        "subtitle": "Automatic per-roommate bill calculation based on actual meals eaten. View monthly analytics and settle instantly via UPI QR.",
        "features": [
            "Automated Individual Bill Breakdown",
            "1-Tap Dynamic UPI QR Code Settlement",
            "Dedicated Amul Milk Ledger & Dish Stats"
        ],
        "pill_top_text": "Total Mess Expense",
        "pill_top_tag": "₹3,420",
        "pill_top_tag_color": "#ffb800",
        "pill_bottom_text": "Alex's Fair Share",
        "pill_bottom_tag": "₹950",
        "pill_bottom_tag_color": "#00f5a0",
        "accent_gradient": "linear-gradient(135deg, #ffb800 10%, #00f5a0 100%)",
        "glow1_color": "rgba(255, 184, 0, 0.18)",
        "glow2_color": "rgba(0, 245, 160, 0.16)",
        "phone_glow": "rgba(255, 184, 0, 0.22)"
    }
]

HTML_TEMPLATE = """<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Feature Graphic</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');

    * {{
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }}

    body {{
      width: 1024px;
      height: 500px;
      overflow: hidden;
      background: #080c14;
      font-family: 'Plus Jakarta Sans', -apple-system, BlinkMacSystemFont, sans-serif;
      color: #ffffff;
      position: relative;
    }}

    /* Ambient Lighting */
    .glow-1 {{
      position: absolute;
      width: 500px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, {glow1_color} 0%, rgba(0, 0, 0, 0) 70%);
      top: -120px;
      left: -80px;
      pointer-events: none;
    }}

    .glow-2 {{
      position: absolute;
      width: 600px;
      height: 600px;
      border-radius: 50%;
      background: radial-gradient(circle, {glow2_color} 0%, rgba(0, 0, 0, 0) 70%);
      bottom: -150px;
      right: 180px;
      pointer-events: none;
    }}

    .glow-phone {{
      position: absolute;
      width: 420px;
      height: 500px;
      border-radius: 50%;
      background: radial-gradient(circle, {phone_glow} 0%, rgba(0, 0, 0, 0) 75%);
      top: 0;
      right: 40px;
      pointer-events: none;
    }}

    /* Subtle Background Grid Pattern */
    .grid-pattern {{
      position: absolute;
      inset: 0;
      background-image: 
        linear-gradient(rgba(255, 255, 255, 0.02) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255, 255, 255, 0.02) 1px, transparent 1px);
      background-size: 32px 32px;
      pointer-events: none;
    }}

    /* Main Container */
    .banner-container {{
      position: relative;
      width: 1024px;
      height: 500px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 28px 52px 28px 56px;
      z-index: 10;
    }}

    /* Left Content Column */
    .content-col {{
      width: 580px;
      display: flex;
      flex-direction: column;
      justify-content: center;
    }}

    /* Top Badge */
    .brand-badge {{
      display: inline-flex;
      align-items: center;
      gap: 8px;
      align-self: flex-start;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.15);
      padding: 5px 14px;
      border-radius: 9999px;
      margin-bottom: 14px;
      backdrop-filter: blur(8px);
    }}

    .badge-dot {{
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: #00f5a0;
      box-shadow: 0 0 10px #00f5a0;
    }}

    .badge-text {{
      font-size: 11px;
      font-weight: 800;
      letter-spacing: 0.12em;
      text-transform: uppercase;
      color: #00f5a0;
    }}

    /* Title */
    .main-title {{
      font-size: 38px;
      font-weight: 800;
      line-height: 1.15;
      letter-spacing: -0.025em;
      color: #ffffff;
      margin-bottom: 12px;
    }}

    .accent-gradient {{
      background: {accent_gradient};
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      display: inline-block;
    }}

    /* Subtitle */
    .subtitle {{
      font-size: 14.5px;
      font-weight: 400;
      line-height: 1.5;
      color: #94a3b8;
      margin-bottom: 20px;
      max-width: 510px;
    }}

    /* Feature Pills Grid */
    .features-list {{
      display: flex;
      flex-direction: column;
      gap: 9px;
      margin-bottom: 22px;
    }}

    .feature-item {{
      display: flex;
      align-items: center;
      gap: 12px;
      background: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      padding: 7px 14px;
      border-radius: 12px;
      width: fit-content;
      backdrop-filter: blur(12px);
    }}

    .feature-icon-box {{
      width: 20px;
      height: 20px;
      border-radius: 6px;
      background: rgba(0, 245, 160, 0.18);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #00f5a0;
    }}

    .feature-text {{
      font-size: 13px;
      font-weight: 600;
      color: #e2e8f0;
      letter-spacing: -0.01em;
    }}

    /* Footer Trust Pill */
    .trust-footer {{
      display: flex;
      align-items: center;
      gap: 10px;
      font-size: 12px;
      color: #64748b;
      font-weight: 500;
    }}

    .trust-dot {{
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: #475569;
    }}

    /* Right Phone Column */
    .phone-col {{
      width: 330px;
      height: 444px;
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }}

    /* Floating Decor Pills */
    .floating-pill {{
      position: absolute;
      top: 48px;
      left: -20px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.18);
      padding: 8px 14px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 245, 160, 0.18);
      z-index: 25;
      backdrop-filter: blur(14px);
    }}

    .floating-pill span {{
      font-size: 12px;
      font-weight: 700;
      color: #f8fafc;
    }}

    .floating-pill .pill-tag {{
      font-size: 9.5px;
      font-weight: 800;
      color: {pill_top_tag_color};
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 7px;
      border-radius: 9999px;
    }}

    .floating-pill-bottom {{
      position: absolute;
      bottom: 35px;
      right: -10px;
      background: rgba(15, 23, 42, 0.92);
      border: 1px solid rgba(255, 255, 255, 0.18);
      padding: 8px 14px;
      border-radius: 9999px;
      display: flex;
      align-items: center;
      gap: 8px;
      box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 212, 255, 0.18);
      z-index: 25;
      backdrop-filter: blur(14px);
    }}

    .floating-pill-bottom span {{
      font-size: 12px;
      font-weight: 700;
      color: #f8fafc;
    }}

    .floating-pill-bottom .pill-tag {{
      font-size: 9.5px;
      font-weight: 800;
      color: {pill_bottom_tag_color};
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 7px;
      border-radius: 9999px;
    }}

    /* Phone Device Frame */
    .phone-mockup {{
      width: 200px;
      height: 432px;
      background: #151c28;
      border-radius: 36px;
      padding: 7px;
      border: 2px solid rgba(255, 255, 255, 0.16);
      box-shadow: 
        0 20px 50px -10px rgba(0, 0, 0, 0.85),
        0 0 45px {phone_glow},
        inset 0 1px 1px rgba(255, 255, 255, 0.35);
      position: relative;
      z-index: 20;
    }}

    .phone-screen {{
      width: 100%;
      height: 100%;
      border-radius: 29px;
      overflow: hidden;
      background: #000000;
      position: relative;
    }}

    .phone-screen img {{
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: top center;
      display: block;
    }}

    /* Dynamic Island Camera */
    .dynamic-island {{
      position: absolute;
      top: 10px;
      left: 50%;
      transform: translateX(-50%);
      width: 52px;
      height: 12px;
      background: #000000;
      border-radius: 9999px;
      z-index: 30;
      border: 0.5px solid rgba(255, 255, 255, 0.1);
    }}
  </style>
</head>
<body>

  <!-- Background Glows -->
  <div class="glow-1"></div>
  <div class="glow-2"></div>
  <div class="glow-phone"></div>
  <div class="grid-pattern"></div>

  <div class="banner-container">
    <!-- Left Column: Copy & Value Proposition -->
    <div class="content-col">
      <div class="brand-badge">
        <div class="badge-dot"></div>
        <span class="badge-text">{badge}</span>
      </div>

      <h1 class="main-title">
        {title_line1}<br>
        <span class="accent-gradient">{title_accent}</span>
      </h1>

      <p class="subtitle">
        {subtitle}
      </p>

      <div class="features-list">
        {feature_items_html}
      </div>

      <div class="trust-footer">
        <span>Designed for Students & Flatmates</span>
        <div class="trust-dot"></div>
        <span>100% Free & Open Source</span>
        <div class="trust-dot"></div>
        <span>No Ads</span>
      </div>
    </div>

    <!-- Right Column: Device Frame Mockup -->
    <div class="phone-col">
      <!-- Floating Accent Pill Top -->
      <div class="floating-pill">
        <span>{pill_top_text}</span>
        <span class="pill-tag">{pill_top_tag}</span>
      </div>

      <!-- Floating Accent Pill Bottom -->
      <div class="floating-pill-bottom">
        <span>{pill_bottom_text}</span>
        <span class="pill-tag">{pill_bottom_tag}</span>
      </div>

      <div class="phone-mockup">
        <div class="dynamic-island"></div>
        <div class="phone-screen">
          <img src="{screenshot}" alt="App Screen">
        </div>
      </div>
    </div>
  </div>

</body>
</html>
"""

def generate():
  chrome_exe = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
  base_dir = r"E:\Anjan\Tiffin Tracker"

  for item in TEMPLATES:
    print(f"Generating {item['name']}...")
    feat_html = ""
    for f in item["features"]:
      feat_html += f"""
        <div class="feature-item">
          <div class="feature-icon-box">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <span class="feature-text">{f}</span>
        </div>"""

    html_content = HTML_TEMPLATE.format(
        badge=item["badge"],
        title_line1=item["title_line1"],
        title_accent=item["title_accent"],
        subtitle=item["subtitle"],
        feature_items_html=feat_html,
        pill_top_text=item["pill_top_text"],
        pill_top_tag=item["pill_top_tag"],
        pill_top_tag_color=item["pill_top_tag_color"],
        pill_bottom_text=item["pill_bottom_text"],
        pill_bottom_tag=item["pill_bottom_tag"],
        pill_bottom_tag_color=item["pill_bottom_tag_color"],
        accent_gradient=item["accent_gradient"],
        glow1_color=item["glow1_color"],
        glow2_color=item["glow2_color"],
        phone_glow=item["phone_glow"],
        screenshot=item["screenshot"],
    )

    temp_html_path = os.path.join(base_dir, f"_temp_feat_{item['id']}.html")
    with open(temp_html_path, "w", encoding="utf-8") as f:
      f.write(html_content)

    temp_png_path = os.path.join(base_dir, f"_temp_feat_{item['id']}.png")
    final_png_path = os.path.join(base_dir, item["name"])

    # Launch Chrome headless to render 1024x600 window
    cmd = [
        chrome_exe,
        "--headless=new",
        f"--screenshot={temp_png_path}",
        "--window-size=1024,600",
        "--hide-scrollbars",
        f"file:///{temp_html_path.replace(os.sep, '/')}",
    ]
    subprocess.run(cmd, check=True)

    # Crop exactly to (0, 0, 1024, 500)
    with Image.open(temp_png_path) as im:
      cropped = im.crop((0, 0, 1024, 500))
      cropped.save(final_png_path, "PNG", optimize=True)
      print(f"Saved {item['name']} with size: {cropped.size}")

    # Clean up temp files
    if os.path.exists(temp_html_path):
      os.remove(temp_html_path)
    if os.path.exists(temp_png_path):
      os.remove(temp_png_path)


if __name__ == "__main__":
  generate()
