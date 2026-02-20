#!/usr/bin/env python3
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import PORT, IS_DEV
from app import app

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=PORT, debug=IS_DEV, threaded=True)
