import pandas as pd
import matplotlib.pyplot as plt
import io
import base64
try:
    from weasyprint import HTML
except Exception:
    HTML = None

def _dataframe_to_excel_bytes(df: pd.DataFrame) -> bytes:
    """Convert a DataFrame to an Excel file in memory.
    Returns the binary content of the .xlsx file.
    """
    with io.BytesIO() as output:
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Report')
        return output.getvalue()

def _dataframe_to_excel_with_chart(df: pd.DataFrame) -> bytes:
    """Generate Excel with a chart using matplotlib and embed as image.
    This is a simplified approach: create a chart image, then add it to the workbook using openpyxl.
    """
    import openpyxl
    from openpyxl.drawing.image import Image as OpenpyxlImage
    # Create chart image
    plt.figure(figsize=(6,4))
    if not df.empty:
        df.plot(kind='bar')
    plt.tight_layout()
    img_bytes = io.BytesIO()
    plt.savefig(img_bytes, format='png')
    plt.close()
    img_bytes.seek(0)

    with io.BytesIO() as output:
        with pd.ExcelWriter(output, engine='openpyxl') as writer:
            df.to_excel(writer, index=False, sheet_name='Report')
            # writer.save() is unnecessary with context manager
            workbook = writer.book
            ws = workbook['Report']
            img = OpenpyxlImage(img_bytes)
            img.anchor = 'G2'  # place image at column G, row 2
            ws.add_image(img)
        return output.getvalue()

def generate_report_html(title: str, df: pd.DataFrame) -> str:
    """Create a simple HTML representation of the report.
    Includes a table generated from the DataFrame.
    """
    table_html = df.to_html(index=False, border=0, classes='report-table')
    html = f"""
    <html>
    <head>
        <style>
            body {{ font-family: 'Inter', sans-serif; padding: 20px; background: #f9f9f9; }}
            h1 {{ color: #2c3e50; }}
            .report-table {{ width: 100%; border-collapse: collapse; }}
            .report-table th, .report-table td {{ border: 1px solid #ddd; padding: 8px; }}
            .report-table th {{ background-color: #2c3e50; color: white; }}
        </style>
    </head>
    <body>
        <h1>{title}</h1>
        {table_html}
    </body>
    </html>
    """
    return html

def export_report(df: pd.DataFrame, title: str, fmt: str = 'pdf') -> bytes:
    """Export the given DataFrame as PDF or Excel.
    Args:
        df: DataFrame with report data.
        title: Title for the report.
        fmt: 'pdf' or 'excel'.
    Returns:
        Bytes of the generated file.
    """
    if fmt == 'pdf':
        html = generate_report_html(title, df)
        if HTML is None:
            raise ImportError('WeasyPrint is not installed; PDF export unavailable')
        pdf_bytes = HTML(string=html).write_pdf()
        return pdf_bytes
    elif fmt == 'excel':
        return _dataframe_to_excel_with_chart(df)
    else:
        raise ValueError(f"Unsupported format: {fmt}")

# Placeholder data generators for various reports
def get_fake_review_report_data():
    data = {
        'Product ID': [101, 102, 103],
        'Total Reviews': [250, 180, 300],
        'Fake Reviews': [30, 20, 45],
        'Fake %': [12.0, 11.1, 15.0]
    }
    return pd.DataFrame(data)

def get_product_trust_report_data():
    data = {
        'Product ID': [101, 102, 103],
        'Trust Score': [85, 78, 92],
        'Confidence': [0.92, 0.88, 0.95]
    }
    return pd.DataFrame(data)

def get_user_activity_report_data():
    data = {
        'User ID': [1, 2, 3, 4],
        'Scans Performed': [15, 8, 23, 5],
        'Reports Submitted': [2, 1, 3, 0]
    }
    return pd.DataFrame(data)

def get_monthly_report_data():
    data = {
        'Metric': ['New Users', 'Total Scans', 'Reports Generated'],
        'Value': [124, 532, 87]
    }
    return pd.DataFrame(data)

def get_ai_performance_report_data():
    data = {
        'Metric': ['Accuracy', 'Precision', 'Recall'],
        'Value': [0.94, 0.91, 0.89]
    }
    return pd.DataFrame(data)
