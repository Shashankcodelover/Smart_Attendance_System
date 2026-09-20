import time
from playwright.sync_api import sync_playwright

def run_test():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1920, "height": 1080})
        
        print("Navigating to Smart Attendance System...")
        page.goto("http://127.0.0.1:8085/index.html")
        page.wait_for_timeout(1000)
        
        # Take home page screenshot
        page.screenshot(path="C:\\Users\\Preetham.j\\.gemini\\antigravity\\brain\\c95f737b-481b-4921-aabf-dc774f62b939\\attendance_home_verified.png")
        print("Took home screenshot.")
        
        # Click the Campus Pulse AI button
        print("Clicking Campus Pulse AI button...")
        page.click("id=btn-campus-pulse")
        page.wait_for_timeout(1000)
        
        # Click Sync button
        print("Syncing Node Matrix...")
        page.click("id=btn-pulse-sync")
        
        # Wait for animation
        page.wait_for_timeout(2000)
        
        # Take the verified feature screenshot
        page.screenshot(path="C:\\Users\\Preetham.j\\.gemini\\antigravity\\brain\\c95f737b-481b-4921-aabf-dc774f62b939\\attendance_pulse_verified.png")
        print("Took Campus Pulse AI verified screenshot.")
        
        browser.close()

if __name__ == "__main__":
    run_test()
