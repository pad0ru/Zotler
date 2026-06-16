"""
UCI Academic Data Scraper
Grabs student data from DegreeWorks, WebSOC (schedule), and UCI Catalogue (prereqs).

Usage:
    python uci_scraper.py --all            # Run all scrapers
    python uci_scraper.py --degreeworks    # DegreeWorks audit only (requires UCI login)
    python uci_scraper.py --schedule       # Current quarter schedule
    python uci_scraper.py --prereqs ICS161 # Prereq chain for a course

Dependencies:
    pip install selenium requests beautifulsoup4 pdfplumber python-dotenv webdriver-manager
"""

import argparse
import csv
import json
import os
import re
import time
from pathlib import Path
from datetime import datetime

import requests
from bs4 import BeautifulSoup
from dotenv import load_dotenv

load_dotenv()

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)

WEBSOC_URL = "https://websoc.reg.uci.edu/perl/WebSoc"
CATALOGUE_BASE = "https://catalogue.uci.edu"
DEGREEWORKS_URL = "https://degreeworks.uci.edu"


# ---------------------------------------------------------------------------
# 1. TRANSCRIPT PARSER — parses unofficial UCI transcript PDF
# ---------------------------------------------------------------------------

def parse_transcript_pdf(pdf_path: str) -> list[dict]:
    """
    Parse an unofficial UCI transcript PDF and extract completed courses.
    Returns a list of course dicts matching the user_courses.csv schema.
    """
    try:
        import pdfplumber
    except ImportError:
        print("Install pdfplumber: pip install pdfplumber")
        return []

    courses = []
    quarter_pattern = re.compile(
        r"(Fall|Winter|Spring|Summer)\s+(\d{4})", re.IGNORECASE
    )
    # UCI transcript line format: DEPT NNN  Course Name   Units  Grade
    course_pattern = re.compile(
        r"([A-Z&/ ]+\d+[A-Z]?)\s{2,}(.+?)\s{2,}(\d+\.?\d*)\s+([A-DF][+-]?|P|NP|W|IP)\s*$"
    )

    current_quarter = None
    current_year = None

    with pdfplumber.open(pdf_path) as pdf:
        for page in pdf.pages:
            text = page.extract_text() or ""
            for line in text.splitlines():
                qm = quarter_pattern.search(line)
                if qm:
                    current_quarter = qm.group(1)
                    current_year = qm.group(2)
                    continue

                cm = course_pattern.match(line.strip())
                if cm and current_quarter:
                    course_id = cm.group(1).strip()
                    course_name = cm.group(2).strip()
                    units = float(cm.group(3))
                    grade = cm.group(4).strip()
                    gpa_map = {
                        "A+": 4.0, "A": 4.0, "A-": 3.7,
                        "B+": 3.3, "B": 3.0, "B-": 2.7,
                        "C+": 2.3, "C": 2.0, "C-": 1.7,
                        "D+": 1.3, "D": 1.0, "D-": 0.7,
                        "F": 0.0,
                    }
                    gpa_pts = gpa_map.get(grade, 0.0) * units if grade in gpa_map else 0.0
                    courses.append({
                        "course_id": course_id,
                        "course_name": course_name,
                        "units": int(units),
                        "grade": grade,
                        "quarter": current_quarter,
                        "year": current_year,
                        "status": "completed",
                        "satisfies_req_id": "",
                        "gpa_points": round(gpa_pts, 1),
                    })

    return courses


def save_user_courses(courses: list[dict], out_path: str | None = None) -> str:
    out = out_path or str(DATA_DIR / "user_courses.csv")
    fieldnames = [
        "course_id", "course_name", "units", "grade",
        "quarter", "year", "status", "satisfies_req_id", "gpa_points",
    ]
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(courses)
    print(f"Saved {len(courses)} courses → {out}")
    return out


# ---------------------------------------------------------------------------
# 2. WEBSOC SCRAPER — current quarter schedule of classes
# ---------------------------------------------------------------------------

CURRENT_YEAR_TERM = {
    "year": datetime.now().year,
    # WebSOC term codes: 92=Fall, 03=Winter, 14=Spring, 25/39/51=Summer
    "term": "14",  # Spring 2026 — update as needed
}


def fetch_websoc(dept: str, course_num: str = "") -> list[dict]:
    """
    Query WebSOC for open sections in the current quarter.
    Returns a list of section dicts.
    """
    params = {
        "Submit": "Display Web Results",
        "YearTerm": f"{CURRENT_YEAR_TERM['year']}-{CURRENT_YEAR_TERM['term']}",
        "ShowFinals": "0",
        "Breadth": "ANY",
        "Dept": dept,
        "CourseNum": course_num,
        "Division": "ANY",
        "CourseCodes": "",
        "InstrName": "",
        "CourseTitle": "",
        "ClassType": "ALL",
        "Units": "",
        "Days": "",
        "StartTime": "",
        "EndTime": "",
        "MaxCap": "",
        "FullCourses": "ANY",
        "FontSize": "100",
        "CancelledCourses": "Exclude",
        "Bldg": "",
        "Room": "",
        "OutputFormat": "Text",
    }

    resp = requests.get(WEBSOC_URL, params=params, timeout=15)
    resp.raise_for_status()

    sections = []
    lines = resp.text.splitlines()
    current_course = None

    # WebSOC text output parsing
    for line in lines:
        course_header = re.match(
            r"(\w[\w\s/&]+)\s+(\d+[A-Z]?)\s+(.+)", line.strip()
        )
        if course_header and not line.startswith(" "):
            current_course = {
                "dept": course_header.group(1).strip(),
                "num": course_header.group(2).strip(),
                "title": course_header.group(3).strip(),
            }
            continue

        section_line = re.match(
            r"\s+(\d{5})\s+(\w+)\s+(\d+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(\S+)\s+(.+)",
            line,
        )
        if section_line and current_course:
            sections.append({
                "dept": current_course["dept"],
                "course_num": current_course["num"],
                "title": current_course["title"],
                "code": section_line.group(1),
                "type": section_line.group(2),
                "sec": section_line.group(3),
                "units": section_line.group(4),
                "instructor": section_line.group(8).strip(),
                "days": section_line.group(5),
                "time": section_line.group(6),
                "place": section_line.group(7),
            })

    return sections


def get_current_schedule(dept_list: list[str]) -> list[dict]:
    """Fetch schedule for a list of departments (e.g. ['ICS', 'MATH', 'STATS'])."""
    all_sections = []
    for dept in dept_list:
        print(f"  Fetching WebSOC: {dept}...")
        try:
            sections = fetch_websoc(dept)
            all_sections.extend(sections)
            time.sleep(0.5)  # be polite
        except Exception as e:
            print(f"  Warning: failed to fetch {dept}: {e}")
    return all_sections


def save_schedule(sections: list[dict], out_path: str | None = None) -> str:
    out = out_path or str(DATA_DIR / "current_schedule.csv")
    if not sections:
        print("No sections found.")
        return out
    fieldnames = list(sections[0].keys())
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(sections)
    print(f"Saved {len(sections)} sections → {out}")
    return out


# ---------------------------------------------------------------------------
# 3. UCI CATALOGUE SCRAPER — course prereqs and descriptions
# ---------------------------------------------------------------------------

def fetch_course_catalogue(dept_slug: str) -> list[dict]:
    """
    Scrape catalogue.uci.edu for a department's course listings,
    extracting course ID, name, units, description, and prerequisites.

    dept_slug examples: 'ics', 'mathematics'
    """
    url = f"{CATALOGUE_BASE}/preview_program.php?catoid=55&poid=&returnto="
    # The real course search endpoint:
    search_url = f"{CATALOGUE_BASE}/content.php?catoid=55&navoid=15699"

    courses = []
    try:
        resp = requests.get(
            f"{CATALOGUE_BASE}/search/?P={dept_slug}&search_database=Courses",
            timeout=15,
            headers={"User-Agent": "Mozilla/5.0 (academic research scraper)"},
        )
        soup = BeautifulSoup(resp.text, "html.parser")

        # Course blocks in catalogue follow pattern: <td class="courselistcomment">
        for block in soup.select("td.courseblockdesc, div.courseblock"):
            title_el = block.find_previous("p", class_="courseblocktitle")
            if not title_el:
                continue
            title_text = title_el.get_text(" ", strip=True)

            # Parse "ICS 31. Introduction to Programming. 4 Units."
            m = re.match(r"([A-Z&/ ]+\d+[A-Z]?)\.\s*(.+?)\.\s*(\d+(?:\.\d+)?)\s*Units?", title_text)
            if not m:
                continue

            desc_text = block.get_text(" ", strip=True)
            prereq_match = re.search(
                r"Prerequisite[s]?:?\s*([^.]+(?:\.[^P][^r])*)", desc_text, re.IGNORECASE
            )
            prereqs = prereq_match.group(1).strip() if prereq_match else ""

            courses.append({
                "course_id": m.group(1).strip(),
                "course_name": m.group(2).strip(),
                "units": m.group(3),
                "prerequisites": prereqs,
                "description": desc_text[:300],
            })
    except Exception as e:
        print(f"  Catalogue scrape failed for '{dept_slug}': {e}")

    return courses


def get_prereq_chain(course_id: str, all_courses: dict[str, dict], depth: int = 0) -> dict:
    """
    Recursively build the full prerequisite chain for a course.
    all_courses: dict of course_id → course dict (from catalogue scrape)
    """
    if depth > 6 or course_id not in all_courses:
        return {"course_id": course_id, "prereqs": []}

    course = all_courses[course_id]
    prereq_str = course.get("prerequisites", "")

    # Extract course IDs from prereq string (e.g. "ICS 31" or "ICS 45C")
    raw_ids = re.findall(r"[A-Z]{2,}&?/?\s*[A-Z]*\s+\d+[A-Z]?", prereq_str)
    prereq_ids = [r.strip() for r in raw_ids]

    return {
        "course_id": course_id,
        "course_name": course.get("course_name", ""),
        "prereqs": [get_prereq_chain(pid, all_courses, depth + 1) for pid in prereq_ids],
    }


def save_catalogue(courses: list[dict], out_path: str | None = None) -> str:
    out = out_path or str(DATA_DIR / "catalogue_courses.csv")
    if not courses:
        print("No catalogue data.")
        return out
    fieldnames = ["course_id", "course_name", "units", "prerequisites", "description"]
    with open(out, "w", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(courses)
    print(f"Saved {len(courses)} catalogue entries → {out}")
    return out


# ---------------------------------------------------------------------------
# 4. DEGREEWORKS SCRAPER — requires UCI credentials (Selenium)
# ---------------------------------------------------------------------------

def scrape_degreeworks(uci_id: str, password: str) -> dict:
    """
    Log into DegreeWorks via UCI SSO and extract the degree audit.
    Returns a dict with completed, in-progress, and remaining requirements.

    Requires: pip install selenium webdriver-manager
    Set UCI_ID and UCI_PASSWORD in .env or pass directly.
    """
    try:
        from selenium import webdriver
        from selenium.webdriver.common.by import By
        from selenium.webdriver.support.ui import WebDriverWait
        from selenium.webdriver.support import expected_conditions as EC
        from webdriver_manager.chrome import ChromeDriverManager
        from selenium.webdriver.chrome.service import Service
    except ImportError:
        print("Install selenium: pip install selenium webdriver-manager")
        return {}

    options = webdriver.ChromeOptions()
    options.add_argument("--headless")          # Remove this to watch it run
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--window-size=1920,1080")

    driver = webdriver.Chrome(
        service=Service(ChromeDriverManager().install()), options=options
    )

    audit = {"completed": [], "in_progress": [], "remaining": [], "gpa": None}

    try:
        # 1. Load DegreeWorks — redirects to UCI SSO
        driver.get(DEGREEWORKS_URL)
        wait = WebDriverWait(driver, 20)

        # 2. UCI SSO login
        wait.until(EC.presence_of_element_located((By.ID, "username")))
        driver.find_element(By.ID, "username").send_keys(uci_id)
        driver.find_element(By.ID, "password").send_keys(password)
        driver.find_element(By.CSS_SELECTOR, "input[type='submit']").click()

        # 3. Handle Duo 2FA if prompted — user must approve on phone
        try:
            wait.until(EC.frame_to_be_available_and_switch_to_it((By.ID, "duo_iframe")))
            trust_btn = wait.until(EC.element_to_be_clickable((By.ID, "trust-browser-button")))
            trust_btn.click()
            driver.switch_to.default_content()
            print("  Duo 2FA: approved — waiting for redirect...")
        except Exception:
            pass  # No Duo, or already trusted

        # 4. Wait for DegreeWorks to load
        wait.until(EC.url_contains("degreeworks"))
        time.sleep(3)

        # 5. Extract degree audit data from the page
        page_source = driver.page_source
        soup = BeautifulSoup(page_source, "html.parser")

        # GPA
        gpa_el = soup.find(text=re.compile(r"GPA", re.IGNORECASE))
        if gpa_el:
            gpa_match = re.search(r"(\d+\.\d+)", str(gpa_el.parent))
            if gpa_match:
                audit["gpa"] = float(gpa_match.group(1))

        # Completed courses (marked with checkmark / COMPLETE in DegreeWorks)
        for row in soup.select("tr.takenCourse, .completed-course"):
            cells = row.find_all("td")
            if len(cells) >= 3:
                audit["completed"].append({
                    "course_id": cells[0].get_text(strip=True),
                    "course_name": cells[1].get_text(strip=True),
                    "grade": cells[2].get_text(strip=True) if len(cells) > 2 else "",
                    "units": cells[3].get_text(strip=True) if len(cells) > 3 else "",
                })

        # Remaining requirements (NOT RUN / INCOMPLETE blocks)
        for block in soup.select(".blockTitle, .requirementTitle"):
            text = block.get_text(strip=True)
            if "NOT COMPLETE" in text.upper() or "IN PROGRESS" in text.upper():
                audit["remaining"].append(text)

        print(f"  DegreeWorks: {len(audit['completed'])} completed, "
              f"{len(audit['remaining'])} remaining requirement blocks")

    except Exception as e:
        print(f"  DegreeWorks scrape error: {e}")
    finally:
        driver.quit()

    return audit


def degreeworks_to_user_courses(audit: dict) -> list[dict]:
    """Convert DegreeWorks audit output to user_courses.csv format."""
    courses = []
    for c in audit.get("completed", []):
        courses.append({
            "course_id": c.get("course_id", ""),
            "course_name": c.get("course_name", ""),
            "units": c.get("units", ""),
            "grade": c.get("grade", ""),
            "quarter": "",
            "year": "",
            "status": "completed",
            "satisfies_req_id": "",
            "gpa_points": "",
        })
    for c in audit.get("in_progress", []):
        courses.append({
            "course_id": c.get("course_id", ""),
            "course_name": c.get("course_name", ""),
            "units": c.get("units", ""),
            "grade": "IP",
            "quarter": "",
            "year": "",
            "status": "in_progress",
            "satisfies_req_id": "",
            "gpa_points": "",
        })
    return courses


# ---------------------------------------------------------------------------
# 5. CLI ENTRYPOINT
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description="UCI Academic Data Scraper")
    parser.add_argument("--all", action="store_true", help="Run all scrapers")
    parser.add_argument("--transcript", metavar="PDF", help="Parse transcript PDF")
    parser.add_argument("--schedule", action="store_true", help="Fetch current quarter schedule")
    parser.add_argument("--prereqs", metavar="COURSE_ID", help="Fetch prereq chain (e.g. ICS161)")
    parser.add_argument("--catalogue", metavar="DEPT", help="Scrape catalogue for dept (e.g. ics)")
    parser.add_argument("--degreeworks", action="store_true", help="Scrape DegreeWorks (requires creds)")
    parser.add_argument("--out", metavar="DIR", help="Output directory (default: data/)")
    args = parser.parse_args()

    uci_id = os.getenv("UCI_ID", "")
    uci_password = os.getenv("UCI_PASSWORD", "")

    if args.transcript or args.all:
        pdf = args.transcript or input("Path to transcript PDF: ").strip()
        print(f"\nParsing transcript: {pdf}")
        courses = parse_transcript_pdf(pdf)
        save_user_courses(courses)

    if args.schedule or args.all:
        print("\nFetching current quarter schedule from WebSOC...")
        sections = get_current_schedule(["ICS", "MATH", "STATS", "COMPSCI"])
        save_schedule(sections)

    if args.catalogue or args.all:
        dept = args.catalogue or "ics"
        print(f"\nScraping UCI Catalogue for: {dept}")
        courses = fetch_course_catalogue(dept)
        save_catalogue(courses)

    if args.prereqs:
        dept_slug = re.sub(r"\d+.*", "", args.prereqs).lower().strip()
        print(f"\nFetching catalogue for prereq lookup: {dept_slug}")
        all_courses_list = fetch_course_catalogue(dept_slug)
        all_courses_dict = {c["course_id"]: c for c in all_courses_list}
        chain = get_prereq_chain(args.prereqs, all_courses_dict)
        print(json.dumps(chain, indent=2))

    if args.degreeworks or args.all:
        if not uci_id:
            uci_id = input("UCI ID (e.g. 12345678): ").strip()
        if not uci_password:
            import getpass
            uci_password = getpass.getpass("UCI Password: ")
        print("\nScraping DegreeWorks (this opens a headless browser)...")
        audit = scrape_degreeworks(uci_id, uci_password)
        courses = degreeworks_to_user_courses(audit)
        save_user_courses(courses)
        print(f"  GPA from DegreeWorks: {audit.get('gpa')}")


if __name__ == "__main__":
    main()
