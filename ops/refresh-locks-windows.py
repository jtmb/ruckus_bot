import pathlib,subprocess,os,json,hashlib,datetime,shutil,ctypes,time,sys,re
assert os.name=='nt'
F=pathlib.Path(r'\\wsl.localhost\Ubuntu\home\brajam\.local\share\branconet-migration\local-image-build-offload-20261025')
R=pathlib.Path(__file__).resolve().parent.parent;O=F/'owned-ruckus-release-20261027';S=O/'lock-generation'
prefix=sys.argv[1];assert re.fullmatch('[a-z][a-z0-9-]{5,60}',prefix) and R.name=='ruckus_bot' and R.is_relative_to(F.resolve())
S.mkdir(parents=True,exist_ok=True)
for name in ['cache','logs','appdata','localappdata','tmp']:(S/name).mkdir(exist_ok=True)
for name in ['user.npmrc','global.npmrc']:
 p=S/name
 if not p.exists():p.write_text('')
 assert p.read_bytes()==b''
assert not(O/(prefix+'-acceptance.json')).exists()
NODE=pathlib.Path('C:/Users/james/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/bin/node.exe')
NPM=pathlib.Path('C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js')
assert NODE.is_file() and NPM.is_file()
def sha(p):return hashlib.file_digest(p.open('rb'),'sha256').hexdigest()
pins={str(p):sha(p) for p in [NODE,NPM,NPM.parent.parent/'package.json']}
assert shutil.disk_usage('C:\\').free>=15*1024**3 and shutil.disk_usage(S).free>=16*1024**3
env=dict(os.environ,NPM_CONFIG_CACHE=str(S/'cache'),NPM_CONFIG_LOGS_DIR=str(S/'logs'),APPDATA=str(S/'appdata'),LOCALAPPDATA=str(S/'localappdata'),TEMP=str(S/'tmp'),TMP=str(S/'tmp'),TMPDIR=str(S/'tmp'),NPM_CONFIG_USERCONFIG=str(S/'user.npmrc'),NPM_CONFIG_GLOBALCONFIG=str(S/'global.npmrc'),NPM_CONFIG_ENGINE_STRICT='true',NPM_CONFIG_FUND='false',NPM_CONFIG_AUDIT='false',NPM_CONFIG_UPDATE_NOTIFIER='false')
rows=[];child=None;passed=False;error=None
try:
    for app in ['api','bot','dashboard','.']:
        folder=R if app=='.' else R/app
        assert not(folder/'node_modules').exists()
        log=O/(prefix+'-'('root' if app=='.'else app)+'.log');assert not log.exists()
        argv=[str(NODE),'--max-old-space-size=512',str(NPM),'install','--package-lock-only','--ignore-scripts','--no-audit','--no-fund','--os=linux','--cpu=x64','--libc=glibc','--prefix',str(folder)]
        started=datetime.datetime.now(datetime.timezone.utc).isoformat()
        with log.open('xb') as out:
            child=subprocess.Popen(argv,cwd=folder,env=env,stdin=subprocess.DEVNULL,stdout=out,stderr=subprocess.STDOUT,creationflags=subprocess.CREATE_NO_WINDOW)
            deadline=time.monotonic()+300
            while child.poll() is None:
                assert time.monotonic()<deadline and shutil.disk_usage('C:\\').free>=15*1024**3 and shutil.disk_usage(S).free>=15*1024**3
                assert log.stat().st_size<=4*1024**2
                time.sleep(1)
        assert child.returncode==0,('lock_generation_failed',app,child.returncode)
        assert not(folder/'node_modules').exists()
        package=folder/'package-lock.json';d=json.loads(package.read_text());assert d['lockfileVersion']==3
        rows.append({'app':app,'startedUTC':started,'finishedUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'exitCode':child.returncode,'lockSHA256':sha(package),'lockBytes':package.stat().st_size,'nodeModulesCreated':False,'scriptsExecuted':False,'logSHA256':sha(log)})
        (O/(prefix+'-progress.json')).write_text(json.dumps({'tools':pins,'rows':rows},indent=2)+'\n')
    assert all(sha(pathlib.Path(p))==v for p,v in pins.items())
    passed=True
except BaseException as exc:
    error=type(exc).__name__
    raise
finally:
    if child is not None and child.poll() is None:
        child.terminate()
        try:child.wait(timeout=15)
        except subprocess.TimeoutExpired:child.kill();child.wait(timeout=15)
    with (O/(prefix+'-result.json')).open('x') as stream:json.dump({'passed':passed,'errorCategory':error,'rows':rows,'scratchRoot':str(S),'sourceLockfilesRetained':True},stream,indent=2)
(O/(prefix+'-acceptance.json')).write_text(json.dumps({'UTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'passed':True,'tools':pins,'existingNodeVersion':subprocess.check_output([str(NODE),'--version']).decode().strip(),'existingNpmVersion':json.loads((NPM.parent.parent/'package.json').read_text())['version'],'runtimeNodeTarget':'22.23.4','noUserSettingsChanged':True,'allCachesAndBuildAppDataInsideDeclaredRoot':str(S),'rows':rows},indent=2)+'\n')
print(json.dumps({'passed':True,'lockfiles':len(rows),'nodeModulesCreated':False,'sourceLockfilesRetained':True}))
