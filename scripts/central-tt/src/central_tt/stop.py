from pathlib import Path
class Stopped(Exception):pass
def check(stop_file):
 """Chamar antes de iniciar e antes de cada ação controlada. Basta criar o arquivo STOP para parar."""
 if Path(stop_file).exists():raise Stopped("STOP presente: execução interrompida pelo operador")
