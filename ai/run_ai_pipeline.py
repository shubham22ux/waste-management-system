"""
SmartWaste Master AI Pipeline Runner
Executes the full Artificial Intelligence training and evaluation suite on the dataset.

Usage:
    python ai/run_ai_pipeline.py
"""

import os
import sys
import json
import time

import sys
try:
    if sys.stdout.encoding != 'utf-8':
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
except Exception:
    pass

from ml_predictor import SmartWastePredictor
from cv_classifier import WasteVisionClassifier
from genetic_optimizer import GeneticRouteOptimizer

def print_banner():
    print("=" * 70)
    print(" [*] SMARTWASTE ARTIFICIAL INTELLIGENCE PIPELINE & MODEL EVALUATOR")
    print("=" * 70)

def main():
    print_banner()
    start_time = time.time()

    # 1. IoT Telemetry Forecasting & Classification
    print("\n[Step 1/3] Loading IoT Telemetry Dataset & Training Machine Learning Models...")
    predictor = SmartWastePredictor()
    ml_metrics = predictor.train()
    
    print(f"  [+] Processed {ml_metrics['dataset_records']} telemetry records from CSV.")
    print(f"  [+] Regression Model (Hours to Overflow): R2 Score = {ml_metrics['regression']['r2_score']} | MAE = {ml_metrics['regression']['mae_hours']} hrs")
    print(f"  [+] Classification Model (Collection Urgency): Accuracy = {ml_metrics['classification']['accuracy'] * 100:.2f}%")
    print("  [+] Feature Importances:")
    for feat in ml_metrics['feature_importance'][:3]:
        print(f"      - {feat['feature']}: {feat['importance'] * 100:.1f}%")

    # 2. Computer Vision Garbage Image Classifier
    print("\n[Step 2/3] Evaluating Computer Vision Waste Image Classifier (CNN / MobileNet)...")
    cv_clf = WasteVisionClassifier()
    cv_metrics = cv_clf.generate_benchmark_metrics()

    print(f"  [+] Evaluated on {cv_metrics['total_test_images']} labeled images across 6 classes.")
    print(f"  [+] Overall Computer Vision Test Accuracy: {cv_metrics['overall_accuracy_percent']}")
    for c in ['Plastic', 'Organic', 'Metal', 'Paper']:
        c_stats = cv_metrics['per_class_metrics'][c]
        print(f"      - {c}: Precision={c_stats['precision']*100:.1f}%, Recall={c_stats['recall']*100:.1f}%, F1={c_stats['f1_score']*100:.1f}%")

    # 3. Genetic Algorithm Route Optimization
    print("\n[Step 3/3] Executing Genetic Algorithm State-Space Search for Fleet Routing...")
    sample_bins = [
        {'id': 1, 'code': 'B-001', 'lat': 12.9756, 'lng': 77.6066, 'fill': 92},
        {'id': 2, 'code': 'B-002', 'lat': 12.9784, 'lng': 77.6408, 'fill': 88},
        {'id': 3, 'code': 'B-003', 'lat': 12.9345, 'lng': 77.6265, 'fill': 95},
        {'id': 4, 'code': 'B-004', 'lat': 12.9121, 'lng': 77.6445, 'fill': 75},
        {'id': 5, 'code': 'B-006', 'lat': 12.9698, 'lng': 77.7499, 'fill': 82},
        {'id': 6, 'code': 'B-011', 'lat': 12.9822, 'lng': 77.6083, 'fill': 89},
        {'id': 7, 'code': 'B-012', 'lat': 12.9723, 'lng': 77.6071, 'fill': 91},
        {'id': 8, 'code': 'B-014', 'lat': 12.9592, 'lng': 77.6974, 'fill': 85},
    ]
    ga = GeneticRouteOptimizer(generations=30)
    ga_results = ga.optimize(sample_bins)

    print(f"  [+] Ran Evolutionary Search across {ga_results['generations_run']} generations.")
    print(f"  [+] Baseline Greedy Distance: {ga_results['baseline_greedy_distance_km']} km")
    print(f"  [+] GA Optimized Distance:    {ga_results['optimized_distance_km']} km")
    print(f"  [+] Routing Efficiency Gain:  +{ga_results['efficiency_improvement_percent']}%")
    print(f"  [+] Fleet Fuel Saved:         {ga_results['estimated_fuel_saved_liters']} Liters")

    # Save Unified AI State
    unified_state = {
        'last_trained_at': time.strftime('%Y-%m-%d %H:%M:%S'),
        'ml_telemetry': ml_metrics,
        'computer_vision': cv_metrics,
        'genetic_optimization': ga_results
    }
    
    out_file = os.path.join(os.path.dirname(__file__), 'ai_system_state.json')
    with open(out_file, 'w', encoding='utf-8') as f:
        json.dump(unified_state, f, indent=2)

    elapsed = time.time() - start_time
    print("\n" + "=" * 70)
    print(f" [SUCCESS] ALL AI MODELS SUCCESSFULLY TRAINED & EVALUATED IN {elapsed:.2f}s!")
    print(f" Saved Model Metrics to: {out_file}")
    print("=" * 70)

if __name__ == '__main__':
    main()
