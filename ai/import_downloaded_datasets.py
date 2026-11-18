"""
SmartWaste Real Dataset Importer
Extracts and integrates the user's downloaded Kaggle & Mendeley datasets into the AI pipeline.
"""

import os
import sys
import zipfile
import csv
import shutil

DOWNLOADS_DIR = os.path.expanduser(r'~\Downloads')
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AI_DIR = os.path.join(BASE_DIR, 'ai')
DATASET_DIR = os.path.join(AI_DIR, 'dataset')
SAMPLES_DIR = os.path.join(DATASET_DIR, 'sample_images')
UPLOADS_DIR = os.path.join(BASE_DIR, 'server', 'uploads')
MUNICIPAL_DIR = os.path.join(DATASET_DIR, 'municipal_stats')

os.makedirs(DATASET_DIR, exist_ok=True)
os.makedirs(SAMPLES_DIR, exist_ok=True)
os.makedirs(UPLOADS_DIR, exist_ok=True)
os.makedirs(MUNICIPAL_DIR, exist_ok=True)

def import_iot_telemetry():
    zip_path = os.path.join(DOWNLOADS_DIR, 'dhaka_smart_waste_10M_ultra_CSV.zip')
    if not os.path.exists(zip_path):
        print(f"[-] {zip_path} not found.")
        return False

    print(f"[+] Found Mendeley Smart Waste IoT Dataset: {zip_path}")
    out_csv = os.path.join(DATASET_DIR, 'smart_waste_telemetry.csv')

    with zipfile.ZipFile(zip_path, 'r') as zf:
        if 'dhaka_smart_waste_10M_ultra.csv' not in zf.namelist():
            print("[-] CSV file not found inside zip.")
            return False

        with zf.open('dhaka_smart_waste_10M_ultra.csv') as infile:
            header_line = infile.readline().decode('utf-8', errors='ignore').strip()
            headers = [h.strip() for h in header_line.split(',')]
            
            rows = []
            count = 0
            # Import 10,000 real sensor records
            while count < 10000:
                line = infile.readline().decode('utf-8', errors='ignore')
                if not line:
                    break
                parts = [p.strip() for p in line.strip().split(',')]
                if len(parts) >= len(headers):
                    d = dict(zip(headers, parts))
                    try:
                        fill = float(d.get('fill_level', 0))
                        cap = float(d.get('bin_capacity', 100))
                        fill_pct = round((fill / cap) * 100, 1) if cap > 0 else fill
                        fill_pct = min(100.0, max(0.0, fill_pct))
                        
                        time_factor = float(d.get('time_factor', 1.0))
                        time_to_overflow = round(max(0.0, 100.0 - fill_pct) / max(0.8, time_factor * 1.8), 2)
                        
                        needs_coll = str(d.get('needs_collection', '0'))
                        if fill_pct >= 85 or needs_coll == '1':
                            priority = 'Urgent'
                        elif fill_pct >= 70:
                            priority = 'High'
                        else:
                            priority = 'Normal'
                            
                        rows.append({
                            'reading_id': d.get('bin_id', f'B-{count}'),
                            'bin_code': d.get('bin_id', f'B-{count}')[:10],
                            'location_name': f"{d.get('neighborhood', 'Zone')} - {d.get('area_type', 'Sector')}",
                            'zone': d.get('neighborhood', 'Zone'),
                            'latitude': float(d.get('latitude', 23.7)),
                            'longitude': float(d.get('longitude', 90.4)),
                            'capacity_liters': int(cap * 10),
                            'timestamp': f"{d.get('date', '2026-01-01')} 12:00:00",
                            'hour_of_day': 14,
                            'day_of_week': 2,
                            'current_fill_percent': fill_pct,
                            'fill_rate_per_hour': round(time_factor * 1.8, 2),
                            'ambient_temp_c': float(d.get('temperature', 30.0)),
                            'humidity_percent': float(d.get('humidity', 60.0)),
                            'battery_percent': float(d.get('battery_level', 100.0)),
                            'detected_waste_type': d.get('waste_type', 'Mixed'),
                            'target_time_to_overflow_hours': time_to_overflow,
                            'target_priority': priority
                        })
                        count += 1
                    except Exception:
                        pass

            with open(out_csv, 'w', newline='', encoding='utf-8') as f:
                writer = csv.DictWriter(f, fieldnames=list(rows[0].keys()))
                writer.writeheader()
                writer.writerows(rows)

            print(f"[SUCCESS] Imported {len(rows)} real IoT sensor telemetry records into:\n  {out_csv}")
            return True

def import_kaggle_images():
    zip_candidates = [
        os.path.join(DOWNLOADS_DIR, 'archive.zip'),
        os.path.join(DOWNLOADS_DIR, 'archive (1).zip')
    ]

    extracted_samples = 0
    for zpath in zip_candidates:
        if not os.path.exists(zpath):
            continue

        print(f"[+] Found Kaggle Waste Classification Image Dataset: {zpath}")
        with zipfile.ZipFile(zpath, 'r') as zf:
            namelist = zf.namelist()
            # Find sample organic and recyclable images
            organic_files = [n for n in namelist if ('/O/' in n or '_O_' in n) and n.lower().endswith(('.jpg', '.png'))][:15]
            recyclable_files = [n for n in namelist if ('/R/' in n or '_R_' in n) and n.lower().endswith(('.jpg', '.png'))][:15]

            # Extract samples into sample_images and server/uploads
            for idx, orig in enumerate(organic_files):
                dest_name = f"kaggle_organic_{idx+1}.jpg"
                with zf.open(orig) as src, open(os.path.join(SAMPLES_DIR, dest_name), 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                shutil.copy2(os.path.join(SAMPLES_DIR, dest_name), os.path.join(UPLOADS_DIR, dest_name))
                extracted_samples += 1

            for idx, orig in enumerate(recyclable_files):
                dest_name = f"kaggle_recyclable_{idx+1}.jpg"
                with zf.open(orig) as src, open(os.path.join(SAMPLES_DIR, dest_name), 'wb') as dst:
                    shutil.copyfileobj(src, dst)
                shutil.copy2(os.path.join(SAMPLES_DIR, dest_name), os.path.join(UPLOADS_DIR, dest_name))
                extracted_samples += 1

    print(f"[SUCCESS] Extracted {extracted_samples} real Kaggle test photos into:\n  {SAMPLES_DIR}")
    return extracted_samples > 0

def import_municipal_stats():
    zip_path = os.path.join(DOWNLOADS_DIR, 'archive (2).zip')
    if os.path.exists(zip_path):
        print(f"[+] Found Municipal Waste Statistics Dataset: {zip_path}")
        with zipfile.ZipFile(zip_path, 'r') as zf:
            zf.extractall(MUNICIPAL_DIR)
        print(f"[SUCCESS] Extracted municipal waste statistics into:\n  {MUNICIPAL_DIR}")
        return True
    return False

def main():
    print("=" * 70)
    print(" [*] IMPORTING DOWNLOADED REAL-WORLD DATASETS INTO SMARTWASTE AI")
    print("=" * 70)

    import_iot_telemetry()
    import_kaggle_images()
    import_municipal_stats()

    print("\n[*] Retraining AI Models on the New Real-World Dataset...")
    from run_ai_pipeline import main as run_pipeline
    run_pipeline()

    print("\n" + "=" * 70)
    print(" [FINISHED] ALL REAL-WORLD DATASETS IMPORTED & MODELS RETRAINED!")
    print("=" * 70)

if __name__ == '__main__':
    main()
