import zipfile
import pandas as pd
import numpy as np

with zipfile.ZipFile("data/iot_telemetry_data.csv.zip") as zf:
    df = pd.read_csv(zf.open("iot_telemetry_data.csv"), nrows=5000)

print("Raw types:")
print(df.dtypes)
print("\nSample values:")
print(df.head(3))
