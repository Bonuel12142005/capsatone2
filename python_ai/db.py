import os
import mysql.connector # type: ignore
from mysql.connector import Error # type: ignore

from typing import Any, Optional, Union, cast

def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host=os.environ.get('ECHOTRACE_DB_HOST', '127.0.0.1'),
            database=os.environ.get('ECHOTRACE_DB_NAME', 'echotrace'),
            user=os.environ.get('ECHOTRACE_DB_USER', 'root'),
            password=os.environ.get('ECHOTRACE_DB_PASSWORD', '')
        )
        return connection
    except Error as e:
        print(f"Error while connecting to MySQL: {e}")
        return None

def fetch_one(query: str, params: Any = None) -> Optional[dict[str, Any]]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchone()
        cursor.close()
        return cast(Optional[dict[str, Any]], result)
    finally:
        conn.close()

def fetch_all(query: str, params: Any = None) -> list[dict[str, Any]]:
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchall()
        cursor.close()
        return cast(list[dict[str, Any]], result)
    finally:
        conn.close()

def execute_query(query: str, params: Any = None) -> Optional[int]:
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor()
        cursor.execute(query, params or ())
        conn.commit()
        last_id = cursor.lastrowid
        cursor.close()
        return last_id
    finally:
        conn.close()
