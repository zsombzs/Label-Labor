from tools import process_row
from ai_suggestions import enhance_errors_with_ai_suggestions


def process_and_validate(raw_rows: list[dict], max_chars_per_line: int = 22, extract_kiszereles: bool = False) -> dict:
    """
    Input: nyers Excel sorok
    Output:
    {
        "processed_rows": [...],   ← renderLabels()-nek kész adatok
        "issues": [...],           ← hibák soronként
        "osszes_hiba": N
    }
    """
    processed_rows = []
    issues = []

    for i, raw_row in enumerate(raw_rows):
        result = process_row(raw_row, i, max_chars_per_line=max_chars_per_line, extract_kiszereles=extract_kiszereles)
        processed_rows.append(result["processed"])

        if result["hibak"]:
            issues.append({
                "row_index": i,
                "excel_sor": result["excel_sor"],
                "termek": result["termek"],
                "hibak": result["hibak"],
            })

    # AI-val intelligens javaslatokat kérünk a hibákra
    if issues:
        print(f"🤖 AI javaslatok kérése {sum(len(i['hibak']) for i in issues)} hibára...")
        issues = enhance_errors_with_ai_suggestions(issues, processed_rows)

    return {
        "processed_rows": processed_rows,
        "issues": issues,
        "osszes_hiba": sum(len(i["hibak"]) for i in issues),
    }
