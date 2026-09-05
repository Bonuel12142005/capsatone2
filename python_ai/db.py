import mysql.connector # type: ignore
from mysql.connector import Error # type: ignore

def get_db_connection():
    try:
        connection = mysql.connector.connect(
            host='127.0.0.1',
            database='echotrace',
            user='root',
            password=''
        )
        return connection
    except Error as e:
        print(f"Error while connecting to MySQL: {e}")
        return None

def fetch_one(query, params=None):
    conn = get_db_connection()
    if not conn:
        return None
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchone()
        cursor.close()
        return result
    finally:
        conn.close()

def fetch_all(query, params=None):
    conn = get_db_connection()
    if not conn:
        return []
    try:
        cursor = conn.cursor(dictionary=True)
        cursor.execute(query, params or ())
        result = cursor.fetchall()
        cursor.close()
        return result
    finally:
        conn.close()

def execute_query(query, params=None):
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
