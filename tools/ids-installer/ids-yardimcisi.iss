; IDS Yardimcisi kurulum betigi (Inno Setup 6). tools\ids-installer\build.js derler ve su tanimlari gecirir:
;   /DAppVersion=0.34.1  /DExtDir=<yayin zip'inden acilan eklenti klasoru>  /DOutputDir=<cikti>  [/DImgDir=<rehber resimleri>]
;
; Kullanici kurulumu: yonetici izni istemez. Guncelleyici (updater\updater.ps1) dosyalari eklenti klasorunun uzerine kendisi
; yazdigindan klasor kullanicinin yazabildigi yerde olmali: %LOCALAPPDATA%\Programs\IDS Yardimcisi\eklenti.
; Daha once elle kurulmus bilgisayarda (guncelleyici kaydi ya da tarayici profili eski klasoru gosteriyorsa) yeni klasor acilmaz,
; eski klasor kullanilir: tarayiciya yuklu olan klasor guncellenmeye devam etsin. Eski klasor kaldirmada silinmez.
; Pakettekinden yeni surum yukluyse dosyalar yazilmaz (guncelleyici yeni surumu getirmis olabilir).
;
; Sihirbaz PortalAlign kurulumundan uyarlandi: Chrome / Edge / ikisi sorulur, secilen her tarayici icin eklenti sayfasi adim adim
; gosterilir, eklenti tarayici profilinde gorunmeden Sonraki acilmaz. manifest.json'daki "key" sayesinde kimlik her bilgisayarda ayni.
; Guncelleyici hem Chrome'a hem Edge'e kaydedilir; kullanici sonradan oteki tarayiciya da ekleyebilsin.

#ifndef AppVersion
  #define AppVersion "0.0.0"
#endif
#ifndef ExtDir
  #define ExtDir "stage"
#endif
#ifndef OutputDir
  #define OutputDir "build_out"
#endif
#ifndef ImgDir
  #define ImgDir "installer_img"
#endif
#ifndef UnpackedExtId
  #define UnpackedExtId "bgepiaaakgecaoehcgjakjcoaejcoiip"
#endif
#define HostName "com.rxalign.idsupdater"

[Setup]
AppId={{7C1E5A94-3B2D-4F6E-A8D1-9E47C2B06F13}
AppName=IDS Yardımcısı
AppVersion={#AppVersion}
AppVerName=IDS Yardımcısı {#AppVersion}
AppPublisher=Rxalign
DefaultDirName={localappdata}\Programs\IDS Yardimcisi
DisableDirPage=yes
DisableProgramGroupPage=yes
DisableWelcomePage=yes
PrivilegesRequired=lowest
OutputDir={#OutputDir}
OutputBaseFilename=IDS-Yardimcisi-Kurulum-{#AppVersion}
Compression=lzma2/max
SolidCompression=yes
WizardStyle=modern
; Eklenti sayfalari resimli rehber tasir; 150: sayfa ic alani 666x417 (100% olcekte).
WizardSizePercent=150
UninstallDisplayName=IDS Yardımcısı
VersionInfoVersion={#AppVersion}
VersionInfoDescription=IDS Yardımcısı kurulumu
CloseApplications=no

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Files]
; Yeni kurulum: {app}\eklenti. Eski elle kurulum varsa onun klasoru (kaldirmada silinmez).
Source: "{#ExtDir}\*"; DestDir: "{app}\eklenti"; Check: UseDefaultExt; Flags: ignoreversion recursesubdirs createallsubdirs
Source: "{#ExtDir}\*"; DestDir: "{code:AdoptedDirCode}"; Check: UseAdoptedExt; Flags: ignoreversion recursesubdirs createallsubdirs uninsneveruninstall
; Eklenti sayfasinin rehber resmi (make_guide.py uretir; ekran olcegine gore biri secilir)
Source: "{#ImgDir}\ext_guide_*.bmp"; Flags: dontcopy
; Eklenti sayfasi kurulumdan ONCE gelir: klasor bu kopyadan onceden konur (bkz. PreCopyExtension)
Source: "{#ExtDir}\*"; DestDir: "{tmp}\pa_ext"; Flags: dontcopy recursesubdirs createallsubdirs

[Registry]
Root: HKCU; Subkey: "Software\Google\Chrome\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{code:HostJsonPath}"; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Microsoft\Edge\NativeMessagingHosts\{#HostName}"; ValueType: string; ValueName: ""; ValueData: "{code:HostJsonPath}"; Flags: uninsdeletekey
; rxalign-ids:// baglanti turu: Rxalign arsivindeki "IDS'te ac" dugmesi eklentinin kurulu olmadigi tarayicida basilinca
; eklentinin kurulu oldugu tarayici kopru sayfasiyla (ids-ac.html) acilir. Eklenti de her surumde kendi tarayicisina gore yeniler.
Root: HKCU; Subkey: "Software\Classes\rxalign-ids"; ValueType: string; ValueName: ""; ValueData: "URL:IDS Yardimcisi"; Check: HasProtoBrowser; Flags: uninsdeletekey
Root: HKCU; Subkey: "Software\Classes\rxalign-ids"; ValueType: string; ValueName: "URL Protocol"; ValueData: ""; Check: HasProtoBrowser
Root: HKCU; Subkey: "Software\Classes\rxalign-ids\shell\open\command"; ValueType: string; ValueName: ""; ValueData: "{code:ProtoCommand}"; Check: HasProtoBrowser

[UninstallDelete]
; Guncelleyicinin sonradan getirdigi dosyalar kurulum kaydinda yok.
Type: filesandordirs; Name: "{app}\eklenti"

[Messages]
turkish.FinishedHeadingLabel=IDS Yardımcısı kuruldu
turkish.FinishedLabelNoIcons=Son adım: tarayıcıdaki Uzantılar sayfasında IDS Yardımcısı'nın "Ayrıntılar" bölümünü açıp "Uzantı seçenekleri"ne basın. Orada Rxalign hesabınızla giriş yapın, Anthropic API anahtarınızı girin ve hasta klasörünü seçin.%n%nEklenti bundan sonra kendiliğinden güncellenir; tarayıcıda yeniden bir şey yapmanız gerekmez.

[Code]
var
  InstallStarted: Boolean;  // dosya kopyalama basladi (Kapat ile cikista temizlik yapilmaz)
  AdoptDone: Boolean;
  AdoptDir: String;

const
  EXT_ID = '{#UnpackedExtId}';
  BR_CHROME = 0;
  BR_EDGE = 1;
  BR_BOTH = 2;      // BR_* seçim sayfasındaki sırayla aynı

var
  ChoicePage: TInputOptionWizardPage;
  ChoiceReady: Boolean;
  BrPage: array[0..1] of TWizardPage;
  BrStatus: array[0..1] of TNewStaticText;
  BrCombo: array[0..1] of TNewComboBox;
  BrDirs: array[0..1] of TStringList;
  BrLoaded: array[0..1] of Boolean;
  BrCopyBtn: array[0..1] of TNewButton;
  BrExe: array[0..1] of String;
  ExtTimer: LongWord;
  ExtInitDone: Boolean;
  UserLocalAppData: String;
  ExtPreCopied, ExtDirExisted: Boolean;

function BrName(B: Integer): String;
begin
  if B = BR_EDGE then Result := 'Edge' else Result := 'Chrome';
end;

function BrUrl(B: Integer): String;
begin
  if B = BR_EDGE then Result := 'edge://extensions' else Result := 'chrome://extensions';
end;

function BrUserData(B: Integer): String;
begin
  if B = BR_EDGE then
    Result := UserLocalAppData + '\Microsoft\Edge\User Data'
  else
    Result := UserLocalAppData + '\Google\Chrome\User Data';
end;

function SetTimer(hWnd, nIDEvent, uElapse, lpTimerFunc: LongWord): LongWord;
  external 'SetTimer@user32.dll stdcall';
function KillTimer(hWnd, uIDEvent: LongWord): BOOL;
  external 'KillTimer@user32.dll stdcall';
function GetForegroundWindow(): HWND;
  external 'GetForegroundWindow@user32.dll stdcall';
function GetClassNameW(hWnd: HWND; lpClassName: String; nMaxCount: Integer): Integer;
  external 'GetClassNameW@user32.dll stdcall';
function GetWindowTextW(hWnd: HWND; lpString: String; nMaxCount: Integer): Integer;
  external 'GetWindowTextW@user32.dll stdcall';
procedure keybd_event(bVk, bScan: Byte; dwFlags, dwExtraInfo: LongWord);
  external 'keybd_event@user32.dll stdcall';

function FindAdoptedDir(): String; forward;
function ShouldCopyExt(): Boolean; forward;

function ExtDirPath(): String;
begin
  Result := FindAdoptedDir();
  if Result = '' then
    Result := WizardDirValue + '\eklenti';
end;

function FindBrowser(const Exe, RelPath: String): String;
var
  S, Key: String;
begin
  Result := '';
  Key := 'SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\' + Exe;
  if RegQueryStringValue(HKLM, Key, '', S) and FileExists(RemoveQuotes(S)) then
    Result := RemoveQuotes(S)
  else if RegQueryStringValue(HKLM32, Key, '', S) and FileExists(RemoveQuotes(S)) then
    Result := RemoveQuotes(S)
  else if RegQueryStringValue(HKCU, Key, '', S) and FileExists(RemoveQuotes(S)) then
    Result := RemoveQuotes(S)
  else if FileExists(ExpandConstant('{commonpf64}\') + RelPath) then
    Result := ExpandConstant('{commonpf64}\') + RelPath
  else if FileExists(ExpandConstant('{commonpf32}\') + RelPath) then
    Result := ExpandConstant('{commonpf32}\') + RelPath
  else if FileExists(UserLocalAppData + '\' + RelPath) then
    Result := UserLocalAppData + '\' + RelPath;
end;

procedure ExtInit();
begin
  if ExtInitDone then
    exit;
  ExtInitDone := True;
  UserLocalAppData := ExpandConstant('{localappdata}');
  BrExe[BR_CHROME] := FindBrowser('chrome.exe', 'Google\Chrome\Application\chrome.exe');
  BrExe[BR_EDGE] := FindBrowser('msedge.exe', 'Microsoft\Edge\Application\msedge.exe');
end;

// JSON metninde OpenPos'taki '{' ile açılan nesnenin bittiği yerin bir sonrası (dizgi içindeki parantezler sayılmaz).
function JsonObjEnd(const S: AnsiString; OpenPos: Integer): Integer;
var
  I, Depth: Integer;
  InStr, Esc: Boolean;
  C: AnsiChar;
begin
  I := OpenPos;
  Depth := 0;
  InStr := False;
  Esc := False;
  repeat
    C := S[I];
    if InStr then
    begin
      if Esc then
        Esc := False
      else if C = '\' then
        Esc := True
      else if C = '"' then
        InStr := False;
    end
    else if C = '"' then
      InStr := True
    else if C = '{' then
      Depth := Depth + 1
    else if C = '}' then
      Depth := Depth - 1;
    I := I + 1;
  until (Depth = 0) or (I > Length(S));
  Result := I;
end;

// JSON nesnesindeki "Key":"değer" (UTF-8 çözülür; \" \\ \/ kaçışları açılır).
function JsonStrField(const Obj: AnsiString; const Key: String): String;
var
  K, Raw: AnsiString;
  P, I: Integer;
  C: AnsiChar;
begin
  Result := '';
  K := '"' + Key + '":"';
  P := Pos(K, Obj);
  if P = 0 then
    exit;
  I := P + Length(K);
  Raw := '';
  while I <= Length(Obj) do
  begin
    C := Obj[I];
    if C = '"' then
      break;
    if (C = '\') and (I < Length(Obj)) then
    begin
      I := I + 1;
      C := Obj[I];
      if (C = '"') or (C = '\') or (C = '/') then
        Raw := Raw + C
      else
        Raw := Raw + '\' + C;
    end
    else
      Raw := Raw + C;
    I := I + 1;
  end;
  Result := UTF8Decode(Raw);
end;

// Chrome eklenti kaydı: extensions.settings altında kimlik + '":' + süslü parantezle açılan nesne. Yüklü eklentinin
// nesnesinde "path" (eklenti klasörü) bulunur. Chrome kaldırılan eklentinin kimliğini boş nesne olarak bırakır
// ('"<kimlik>":{}'), bu yüzden yalnızca kimliği aramak yetmez: nesne sonuna kadar okunur ve içinde "path" aranır.
// Sabitlenmiş simge listesi / imza (macs) gibi başka yerlerde kimlik süslü parantezle açılmaz.
function TextHasExt(const S: AnsiString): Boolean;
var
  Key, Rest: AnsiString;
  P, E: Integer;
begin
  Result := False;
  Key := '"' + EXT_ID + '":{';
  Rest := S;
  P := Pos(Key, Rest);
  while (P > 0) and not Result do
  begin
    E := JsonObjEnd(Rest, P + Length(Key) - 1);
    if Pos('"path":', Copy(Rest, P, E - P)) > 0 then
      Result := True
    else
    begin
      Rest := Copy(Rest, E, Length(Rest));
      P := Pos(Key, Rest);
    end;
  end;
end;

function FileHasExt(const F: String): Boolean;
var
  S: AnsiString;
begin
  Result := False;
  if FileExists(F) and LoadStringFromFile(F, S) then
    Result := TextHasExt(S);
end;

// Tarayıcı kullanıcıları (profil klasörü + görünen ad + e-posta) "Local State" dosyasından. Birden fazla kullanıcı varsa
// tarayıcı adresle çağrılınca kullanıcı seçme ekranı açılır ve adres kaybolur; seçilen kullanıcı --profile-directory
// ile verilince doğrudan o kullanıcının penceresi açılır. Edge, Chrome ile aynı dosya biçimini kullanır.
procedure LoadProfiles(B: Integer);
var
  Base, Dir, Lbl, User: String;
  S, Info, K, Obj: AnsiString;
  IC, P, E, Sel: Integer;
  FR: TFindRec;
begin
  if BrLoaded[B] then
    exit;
  BrLoaded[B] := True;
  ExtInit();
  Base := BrUserData(B);
  if not LoadStringFromFile(Base + '\Local State', S) then
    exit;
  K := '"info_cache":{';
  IC := Pos(K, S);
  if IC = 0 then
    exit;
  Info := Copy(S, IC, JsonObjEnd(S, IC + Length(K) - 1) - IC);
  Sel := -1;
  if FindFirst(Base + '\*', FR) then
  try
    repeat
      Dir := FR.Name;
      if ((FR.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0) and (Dir <> '.') and (Dir <> '..')
         and FileExists(Base + '\' + Dir + '\Preferences') then
      begin
        K := '"' + Dir + '":{';
        P := Pos(K, Info);
        if P > 0 then
        begin
          E := JsonObjEnd(Info, P + Length(K) - 1);
          Obj := Copy(Info, P, E - P);
          Lbl := JsonStrField(Obj, 'name');
          User := JsonStrField(Obj, 'user_name');
          if Lbl = '' then
            Lbl := Dir;
          if User <> '' then
            Lbl := Lbl + '   (' + User + ')';
          if FileHasExt(Base + '\' + Dir + '\Secure Preferences') or FileHasExt(Base + '\' + Dir + '\Preferences') then
            Lbl := Lbl + '   ✓ eklenti yüklü';
          BrCombo[B].Items.Add(Lbl);
          BrDirs[B].Add(Dir);
          if CompareText(Dir, JsonStrField(S, 'last_used')) = 0 then
            Sel := BrDirs[B].Count - 1;
        end;
      end;
    until not FindNext(FR);
  finally
    FindClose(FR);
  end;
  if (Sel < 0) and (BrDirs[B].Count > 0) then
    Sel := 0;
  BrCombo[B].ItemIndex := Sel;
end;

function ExtensionInstalled(B: Integer): Boolean;
var
  Base: String;
  FR: TFindRec;
begin
  Result := False;
  Base := BrUserData(B);
  if FindFirst(Base + '\*', FR) then
  try
    repeat
      if ((FR.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0) and (FR.Name <> '.') and (FR.Name <> '..') then
        if FileHasExt(Base + '\' + FR.Name + '\Secure Preferences') or FileHasExt(Base + '\' + FR.Name + '\Preferences') then
          Result := True;
    until Result or not FindNext(FR);
  finally
    FindClose(FR);
  end;
end;

function BrOfPage(PageID: Integer): Integer;
begin
  Result := -1;
  if (BrPage[BR_CHROME] <> nil) and (PageID = BrPage[BR_CHROME].ID) then
    Result := BR_CHROME
  else if (BrPage[BR_EDGE] <> nil) and (PageID = BrPage[BR_EDGE].ID) then
    Result := BR_EDGE;
end;

procedure UpdateExtStatus(B: Integer);
begin
  ExtInit();
  if ExtensionInstalled(B) then
  begin
    BrStatus[B].Caption := '✓ Eklenti ' + BrName(B) + '''de bulundu. Kuruluma devam etmek için Sonraki''ye basın.';
    BrStatus[B].Font.Color := $00207A20;
    WizardForm.NextButton.Enabled := True;
  end
  else if BrExe[B] = '' then
  begin
    BrStatus[B].Caption := 'Bu bilgisayarda ' + BrName(B) + ' bulunamadı. Geri dönüp başka bir tarayıcı seçin.';
    BrStatus[B].Font.Color := $00336699;
    WizardForm.NextButton.Enabled := False;
  end
  else
  begin
    BrStatus[B].Caption := 'Eklenti bekleniyor… ' + BrName(B) + '''e ekledikten sonra birkaç saniye içinde burada ✓ görünür ve Sonraki açılır.';
    BrStatus[B].Font.Color := $003B2215;
    WizardForm.NextButton.Enabled := False;
  end;
end;

procedure ExtTimerProc(Wnd, Msg, TimerID, Time: LongWord);
var
  B: Integer;
begin
  B := BrOfPage(WizardForm.CurPageID);
  if B >= 0 then
    UpdateExtStatus(B);
end;

procedure StopExtTimer();
begin
  if ExtTimer <> 0 then
  begin
    KillTimer(0, ExtTimer);
    ExtTimer := 0;
  end;
end;

procedure SetClipText(const T: String);
var
  R: Integer;
begin
  Exec(ExpandConstant('{cmd}'), '/c echo|set /p="' + T + '"|clip', '', SW_HIDE, ewWaitUntilTerminated, R);
end;

procedure CopyExtPath(B: Integer);
begin
  SetClipText(ExtDirPath());
  BrCopyBtn[B].Caption := 'Kopyalandı ✓';
end;

procedure ExtCopyChromeClick(Sender: TObject);
begin
  CopyExtPath(BR_CHROME);
end;

procedure ExtCopyEdgeClick(Sender: TObject);
begin
  CopyExtPath(BR_EDGE);
end;

// Öndeki pencere seçilen tarayıcının penceresi mi (kurulum penceresi değil)? Tuşlar yalnızca o zaman gönderilir.
// Edge başlığında "Microsoft" ile "Edge" arasında görünmez karakter var; bu yüzden yalnızca "Edge" aranır.
function BrowserForeground(B: Integer): Boolean;
var
  H: HWND;
  Cls, Title, Token: String;
  L: Integer;
begin
  Result := False;
  H := GetForegroundWindow();
  if (H = 0) or (H = WizardForm.Handle) then
    exit;
  Cls := StringOfChar(' ', 256);
  L := GetClassNameW(H, Cls, 256);
  Cls := Copy(Cls, 1, L);
  Title := StringOfChar(' ', 512);
  L := GetWindowTextW(H, Title, 512);
  Title := Copy(Title, 1, L);
  if B = BR_EDGE then Token := 'Edge' else Token := 'Google Chrome';
  Result := (Cls = 'Chrome_WidgetWin_1') and (Pos(Token, Title) > 0);
end;

procedure PressKeys(Ctrl: Boolean; Vk: Byte);
begin
  if Ctrl then
    keybd_event($11, 0, 0, 0);
  keybd_event(Vk, 0, 0, 0);
  keybd_event(Vk, 0, 2, 0);
  if Ctrl then
    keybd_event($11, 0, 2, 0);
  Sleep(150);
end;

// Chrome da Edge de komut satırından verilen chrome:// / edge:// adreslerini açmaz (yeni sekme açar; ikisi de denendi).
// Bu yüzden tarayıcı seçilen kullanıcıyla yeni pencerede açılır, pencere öne gelince Ctrl+T (yeni sekme, sayfa kaybolmaz),
// Ctrl+V (eklenti adresi panoda) ve Enter gönderilir. Edge'in yeni sekmesinde imleç arama kutusunda kalabildiği için orada
// önce Ctrl+L ile adres çubuğuna geçilir. Sonra pano eklenti klasörünün yoluna döner (4. adım için).
procedure OpenExtPage(B: Integer);
var
  R, I: Integer;
  Params: String;
  Typed: Boolean;
begin
  ExtInit();
  if BrExe[B] = '' then
  begin
    MsgBox(BrName(B) + ' bulunamadı.', mbError, MB_OK);
    exit;
  end;
  SetClipText(BrUrl(B));
  Params := '--new-window';
  if (BrCombo[B].ItemIndex >= 0) and (BrCombo[B].ItemIndex < BrDirs[B].Count) then
    Params := '--profile-directory="' + BrDirs[B][BrCombo[B].ItemIndex] + '" ' + Params;
  ExecAsOriginalUser(BrExe[B], Params, '', SW_SHOWNORMAL, ewNoWait, R);
  Typed := False;
  for I := 1 to 40 do
  begin
    Sleep(250);
    if BrowserForeground(B) then
    begin
      Sleep(700);
      if BrowserForeground(B) then
      begin
        PressKeys(True, Ord('T'));
        Sleep(400);
        // Yapıştır + Enter başka pencereye gitmesin: tarayıcı hâlâ öndeyse devam (ilk açılış penceresi odağı alabiliyor).
        if BrowserForeground(B) then
        begin
          if B = BR_EDGE then
          begin
            PressKeys(True, Ord('L'));
            Sleep(150);
          end;
          PressKeys(True, Ord('V'));
          Sleep(200);
          PressKeys(False, $0D);
          Typed := True;
        end;
      end;
      break;
    end;
  end;
  Sleep(600);
  CopyExtPath(B);
  if not Typed then
    MsgBox(BrName(B) + ' açıldı ama eklenti sayfasına geçilemedi.' + #13#10#13#10 +
      BrName(B) + '''in adres çubuğuna ' + BrUrl(B) + ' yazıp Enter''a basın, sonra 2. adımdan devam edin.',
      mbInformation, MB_OK);
end;

procedure ExtOpenChromeClick(Sender: TObject);
begin
  OpenExtPage(BR_CHROME);
end;

procedure ExtOpenEdgeClick(Sender: TObject);
begin
  OpenExtPage(BR_EDGE);
end;

// Eklenti klasörünü kurulumdan ÖNCE yerine koy: Chrome'a eklenecek klasör kurulum klasörünün kendisi
// ({app}\chrome-extension); program güncellenirken burayı yeniler. Kurulum "Kapat" ile bırakılırsa silinir.
procedure CopyTree(const Src, Dst: String);
var
  FR: TFindRec;
begin
  ForceDirectories(Dst);
  if FindFirst(Src + '\*', FR) then
  try
    repeat
      if (FR.Name <> '.') and (FR.Name <> '..') then
      begin
        if (FR.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0 then
          CopyTree(Src + '\' + FR.Name, Dst + '\' + FR.Name)
        else
          FileCopy(Src + '\' + FR.Name, Dst + '\' + FR.Name, False);
      end;
    until not FindNext(FR);
  finally
    FindClose(FR);
  end;
end;

procedure PreCopyExtension();
begin
  if ExtPreCopied then
    exit;
  ExtPreCopied := True;
  ExtDirExisted := DirExists(ExtDirPath());
  if not ShouldCopyExt() then
    exit;
  try
    ExtractTemporaryFiles('{tmp}\pa_ext\*');
    CopyTree(ExpandConstant('{tmp}\pa_ext'), ExtDirPath());
  except
    Log('Eklenti klasörü önceden kopyalanamadı: ' + GetExceptionMessage);
  end;
  Log('Eklenti klasörü hazır: ' + ExtDirPath() + ' manifest=' + IntToStr(Ord(FileExists(ExtDirPath() + '\manifest.json'))));
end;

// Ekran ölçeğine en uygun rehber resmi (100/125/150/200); sayfaya sığmayan büyük sürüm seçilmez.
function GuideVariant(Page: TWizardPage): Integer;
var
  S: Integer;
begin
  S := ScaleX(100);
  if (S >= 200) and (1200 <= Page.SurfaceWidth) then Result := 200
  else if (S >= 150) and (900 <= Page.SurfaceWidth) then Result := 150
  else if (S >= 125) and (750 <= Page.SurfaceWidth) then Result := 125
  else Result := 100;
end;

// Chrome ve Edge sayfaları aynı düzende: yalnızca yönerge, düğmeler ve rehber resmi tarayıcıya göre değişir.
function BuildExtPage(B, AfterID: Integer): TWizardPage;
var
  Page: TWizardPage;
  Steps, ProfLbl: TNewStaticText;
  OpenBtn: TNewButton;
  Guide: TBitmapImage;
  Y, V: Integer;
  F, N: String;
begin
  N := BrName(B);
  Page := CreateCustomPage(AfterID, N + ' eklentisi',
    'IDS Yardımcısı eklentisini ' + N + '''e ekleyin. Yalnızca bir kez yapılır, yaklaşık 30 saniye sürer.');
  Result := Page;

  Steps := TNewStaticText.Create(Page);
  Steps.Parent := Page.Surface;
  Steps.AutoSize := False;
  Steps.WordWrap := True;
  Steps.Left := 0;
  Steps.Top := 0;
  Steps.Width := Page.SurfaceWidth;
  Steps.Height := ScaleY(100);
  if B = BR_EDGE then
    Steps.Caption :=
      '1.  Kendi Edge kullanıcınızı seçip "Edge eklenti sayfasını aç"a basın. Edge açılıp eklenti sayfasına kendisi' + #13#10 +
      '     gider; o birkaç saniye klavyeye ve fareye dokunmayın (klasör yolu da panoya kopyalanır).' + #13#10 +
      '2.  Açılan "Uzantılar" sayfasında sol alttaki "Geliştirici modu" anahtarını açın.' + #13#10 +
      '3.  Sağ üstte çıkan "Açılmışı yükle" düğmesine basın.' + #13#10 +
      '4.  Açılan pencerenin altındaki "Klasör" kutusuna Ctrl+V ile yapıştırın ve "Klasör seç"e basın.' + #13#10 +
      '5.  Buraya dönün: kurulum eklentiyi kendisi bulur ve Sonraki açılır.'
  else
    Steps.Caption :=
      '1.  Kendi Chrome kullanıcınızı seçip "Chrome eklenti sayfasını aç"a basın. Chrome açılıp eklenti sayfasına kendisi' + #13#10 +
      '     gider; o birkaç saniye klavyeye ve fareye dokunmayın (klasör yolu da panoya kopyalanır).' + #13#10 +
      '2.  Açılan "Uzantılar" sayfasında sağ üstteki "Geliştirici modu" anahtarını açın.' + #13#10 +
      '3.  Sol üstte çıkan "Paketlenmemiş öğe yükle" düğmesine basın.' + #13#10 +
      '4.  Açılan pencerenin altındaki "Klasör" kutusuna Ctrl+V ile yapıştırın ve "Klasör seç"e basın.' + #13#10 +
      '5.  Buraya dönün: kurulum eklentiyi kendisi bulur ve Sonraki açılır.';

  Y := Steps.Top + Steps.Height + ScaleY(4);
  BrDirs[B] := TStringList.Create;
  ProfLbl := TNewStaticText.Create(Page);
  ProfLbl.Parent := Page.Surface;
  ProfLbl.Caption := N + ' kullanıcısı:';
  ProfLbl.Left := 0;
  ProfLbl.Top := Y + ScaleY(4);
  BrCombo[B] := TNewComboBox.Create(Page);
  BrCombo[B].Parent := Page.Surface;
  BrCombo[B].Style := csDropDownList;
  BrCombo[B].Left := ProfLbl.Left + ProfLbl.Width + ScaleX(8);
  BrCombo[B].Top := Y;
  BrCombo[B].Width := ScaleX(380);
  Y := Y + BrCombo[B].Height + ScaleY(6);
  OpenBtn := TNewButton.Create(Page);
  OpenBtn.Parent := Page.Surface;
  OpenBtn.Caption := N + ' eklenti sayfasını aç';
  OpenBtn.Left := 0;
  OpenBtn.Top := Y;
  OpenBtn.Width := ScaleX(210);
  OpenBtn.Height := ScaleY(28);
  if B = BR_EDGE then OpenBtn.OnClick := @ExtOpenEdgeClick else OpenBtn.OnClick := @ExtOpenChromeClick;

  BrCopyBtn[B] := TNewButton.Create(Page);
  BrCopyBtn[B].Parent := Page.Surface;
  BrCopyBtn[B].Caption := 'Klasör yolunu kopyala';
  BrCopyBtn[B].Left := OpenBtn.Left + OpenBtn.Width + ScaleX(10);
  BrCopyBtn[B].Top := Y;
  BrCopyBtn[B].Width := ScaleX(160);
  BrCopyBtn[B].Height := ScaleY(28);
  if B = BR_EDGE then BrCopyBtn[B].OnClick := @ExtCopyEdgeClick else BrCopyBtn[B].OnClick := @ExtCopyChromeClick;

  Y := Y + OpenBtn.Height + ScaleY(8);
  V := GuideVariant(Page);
  if B = BR_EDGE then F := 'ext_guide_edge_' else F := 'ext_guide_';
  F := F + IntToStr(V) + '.bmp';
  try
    ExtractTemporaryFile(F);
    Guide := TBitmapImage.Create(Page);
    Guide.Parent := Page.Surface;
    Guide.Bitmap.LoadFromFile(ExpandConstant('{tmp}\') + F);
    Guide.Left := 0;
    Guide.Top := Y;
    // Resim ölçeğe uygun boyutta hazır; ölçek tam tutmazsa sayfaya oranlı sığdırılır.
    if Abs(ScaleX(600) - 6 * V) <= 2 then
    begin
      Guide.Width := Guide.Bitmap.Width;
      Guide.Height := Guide.Bitmap.Height;
    end
    else
    begin
      Guide.Stretch := True;
      Guide.Width := ScaleX(600);
      Guide.Height := ScaleY(150);
    end;
    Y := Y + Guide.Height + ScaleY(8);
  except
    Log('Rehber resmi yüklenemedi: ' + GetExceptionMessage);
  end;

  BrStatus[B] := TNewStaticText.Create(Page);
  BrStatus[B].Parent := Page.Surface;
  BrStatus[B].AutoSize := False;
  BrStatus[B].WordWrap := True;
  BrStatus[B].Left := 0;
  BrStatus[B].Top := Y;
  BrStatus[B].Width := Page.SurfaceWidth;
  BrStatus[B].Height := ScaleY(40);
  BrStatus[B].Font.Style := [fsBold];
end;

procedure InitializeWizard();
begin
  ChoicePage := CreateInputOptionPage(wpSelectTasks, 'Tarayıcı seçimi', 'IDS Yardımcısı hangi tarayıcıya eklensin?',
    'Invisalign Doctor Site''ı açtığınız tarayıcıyı seçin. Eklenti o tarayıcıda hasta fotoğraflarını yerleştirir ve reçete formunu doldurur.',
    True, False);
  ChoicePage.Add('Google Chrome');
  ChoicePage.Add('Microsoft Edge');
  ChoicePage.Add('İkisi de (önce Chrome, sonra Edge)');
  BrPage[BR_CHROME] := BuildExtPage(BR_CHROME, ChoicePage.ID);
  BrPage[BR_EDGE] := BuildExtPage(BR_EDGE, BrPage[BR_CHROME].ID);
end;

// Seçim sayfası: bu bilgisayarda olmayan tarayıcı seçilemez; eklentisi zaten ekli olan işaretlenir ve varsayılan gelir.
procedure SetupChoice();
var
  B, Sel: Integer;
  Has, Ext: array[0..1] of Boolean;
  Cap: String;
begin
  if ChoiceReady then
    exit;
  ChoiceReady := True;
  ExtInit();
  for B := BR_CHROME to BR_EDGE do
  begin
    Has[B] := BrExe[B] <> '';
    Ext[B] := Has[B] and ExtensionInstalled(B);
    ChoicePage.CheckListBox.ItemEnabled[B] := Has[B];
    if B = BR_EDGE then Cap := 'Microsoft Edge' else Cap := 'Google Chrome';
    if not Has[B] then
      Cap := Cap + '   (bu bilgisayarda bulunamadı)'
    else if Ext[B] then
      Cap := Cap + '   ✓ eklenti yüklü';
    ChoicePage.CheckListBox.ItemCaption[B] := Cap;
  end;
  ChoicePage.CheckListBox.ItemEnabled[BR_BOTH] := Has[BR_CHROME] and Has[BR_EDGE];
  if Ext[BR_CHROME] and Ext[BR_EDGE] then Sel := BR_BOTH
  else if Ext[BR_EDGE] then Sel := BR_EDGE
  else if Has[BR_CHROME] then Sel := BR_CHROME
  else if Has[BR_EDGE] then Sel := BR_EDGE
  else Sel := -1;
  if Sel >= 0 then
    ChoicePage.SelectedValueIndex := Sel;
end;

function BrWanted(B: Integer): Boolean;
begin
  Result := (ChoicePage.SelectedValueIndex = B) or (ChoicePage.SelectedValueIndex = BR_BOTH);
end;

function ShouldSkipPage(PageID: Integer): Boolean;
var
  B: Integer;
begin
  Result := False;
  B := BrOfPage(PageID);
  if B >= 0 then
  begin
    ExtInit();
    Result := (not BrWanted(B)) or ExtensionInstalled(B);  { seçilmedi ya da eklenti zaten ekli }
  end;
end;

procedure CurPageChanged(CurPageID: Integer);
var
  B: Integer;
begin
  if (ChoicePage <> nil) and (CurPageID = ChoicePage.ID) then
    SetupChoice();
  B := BrOfPage(CurPageID);
  if B >= 0 then
  begin
    PreCopyExtension();
    LoadProfiles(B);
    WizardForm.CancelButton.Caption := 'Kapat';
    UpdateExtStatus(B);
    if ExtTimer = 0 then
      ExtTimer := SetTimer(0, 0, 2000, CreateCallback(@ExtTimerProc));
  end
  else
  begin
    StopExtTimer();
    WizardForm.CancelButton.Caption := SetupMessage(msgButtonCancel);
  end;
end;

function NextButtonClick(CurPageID: Integer): Boolean;
var
  B: Integer;
begin
  Result := True;
  if (ChoicePage <> nil) and (CurPageID = ChoicePage.ID) and (ChoicePage.SelectedValueIndex < 0) then
  begin
    MsgBox('IDS Yardımcısı için bu bilgisayarda Google Chrome ya da Microsoft Edge gerekli.', mbError, MB_OK);
    Result := False;
    exit;
  end;
  B := BrOfPage(CurPageID);
  if B >= 0 then
  begin
    UpdateExtStatus(B);
    Result := WizardForm.NextButton.Enabled;
  end;
end;

procedure CancelButtonClick(CurPageID: Integer; var Cancel, Confirm: Boolean);
var
  B: Integer;
begin
  B := BrOfPage(CurPageID);
  if B >= 0 then
  begin
    Confirm := False;
    Cancel := MsgBox('Eklenti ' + BrName(B) + '''e eklenmeden IDS Yardımcısı kurulmaz.' + #13#10#13#10 +
      'Kurulumdan çıkılsın mı?', mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES;
  end;
end;

procedure DeinitializeSetup();
begin
  StopExtTimer();
  // Kurulum başlamadan kapatıldı: önceden konan eklenti klasörünü (önceden yoksa) ve boş kalan klasörü sil.
  if ExtPreCopied and not InstallStarted and not ExtDirExisted then
  begin
    DelTree(ExtDirPath(), True, True, True);
    RemoveDir(ExtractFileDir(ExtDirPath()));
  end;
end;

{ ---------------------------------------------------------------------------------------------------------------
  Eski elle kurulum: guncelleyici kaydi ya da tarayici profili var olan bir eklenti klasorunu gosteriyorsa o klasor kullanilir.
  Gelistirici klasorleri (node_modules ya da ust klasorde .git) sayilmaz. }
function IsUsableExtDir(const D: String): Boolean;
begin
  Result := (D <> '') and FileExists(D + '\manifest.json') and FileExists(D + '\updater\updater.ps1')
    and not DirExists(D + '\node_modules') and not DirExists(ExtractFileDir(D) + '\.git');
end;

function HostDirFromRegistry(const Key: String): String;
var
  S: String;
begin
  Result := '';
  if RegQueryStringValue(HKCU, Key, '', S) then
    Result := ExtractFileDir(ExtractFileDir(S));
end;

// Tarayici profil dosyasinda eklentinin kayitli klasoru (paketlenmemis eklentide "path" tam yoldur).
function ExtPathInText(const S: AnsiString): String;
var
  Key, Rest: AnsiString;
  P, E: Integer;
begin
  Result := '';
  Key := '"' + EXT_ID + '":{';
  Rest := S;
  P := Pos(Key, Rest);
  while (P > 0) and (Result = '') do
  begin
    E := JsonObjEnd(Rest, P + Length(Key) - 1);
    Result := JsonStrField(Copy(Rest, P, E - P), 'path');
    if Result = '' then
    begin
      Rest := Copy(Rest, E, Length(Rest));
      P := Pos(Key, Rest);
    end;
  end;
end;

function ExtPathInFile(const F: String): String;
var
  S: AnsiString;
begin
  Result := '';
  if FileExists(F) and LoadStringFromFile(F, S) then
    Result := ExtPathInText(S);
end;

function ExtPathInProfiles(B: Integer): String;
var
  Base, P: String;
  FR: TFindRec;
begin
  Result := '';
  Base := BrUserData(B);
  if FindFirst(Base + '\*', FR) then
  try
    repeat
      if ((FR.Attributes and FILE_ATTRIBUTE_DIRECTORY) <> 0) and (FR.Name <> '.') and (FR.Name <> '..') then
      begin
        P := ExtPathInFile(Base + '\' + FR.Name + '\Secure Preferences');
        if not IsUsableExtDir(P) then
          P := ExtPathInFile(Base + '\' + FR.Name + '\Preferences');
        if IsUsableExtDir(P) then
          Result := P;
      end;
    until (Result <> '') or not FindNext(FR);
  finally
    FindClose(FR);
  end;
end;

function FindAdoptedDir(): String;
var
  C: String;
begin
  if not AdoptDone then
  begin
    AdoptDone := True;
    ExtInit();
    C := HostDirFromRegistry('Software\Google\Chrome\NativeMessagingHosts\{#HostName}');
    if not IsUsableExtDir(C) then
      C := HostDirFromRegistry('Software\Microsoft\Edge\NativeMessagingHosts\{#HostName}');
    if not IsUsableExtDir(C) then
      C := ExtPathInProfiles(BR_CHROME);
    if not IsUsableExtDir(C) then
      C := ExtPathInProfiles(BR_EDGE);
    if IsUsableExtDir(C) and (CompareText(C, WizardDirValue + '\eklenti') <> 0) then
      AdoptDir := C;
    Log('Eski eklenti klasoru: "' + AdoptDir + '"');
  end;
  Result := AdoptDir;
end;

function ManifestVersion(const F: String): String;
var
  S: AnsiString;
  P: Integer;
begin
  Result := '';
  if not LoadStringFromFile(F, S) then
    exit;
  P := Pos('"version"', S);
  if P = 0 then
    exit;
  S := Copy(S, P + 9, 40);
  P := Pos('"', S);
  if P = 0 then
    exit;
  S := Copy(S, P + 1, 40);
  P := Pos('"', S);
  if P > 0 then
    Result := Copy(S, 1, P - 1);
end;

function VerPart(var S: String): Integer;
var
  P: Integer;
begin
  P := Pos('.', S);
  if P = 0 then
  begin
    Result := StrToIntDef(S, 0);
    S := '';
  end
  else
  begin
    Result := StrToIntDef(Copy(S, 1, P - 1), 0);
    Delete(S, 1, P);
  end;
end;

function VerNewer(A, B: String): Boolean;
var
  I, X, Y: Integer;
begin
  Result := False;
  for I := 1 to 4 do
  begin
    X := VerPart(A);
    Y := VerPart(B);
    if X <> Y then
    begin
      Result := X > Y;
      exit;
    end;
  end;
end;

function ShouldCopyExt(): Boolean;
begin
  Result := not VerNewer(ManifestVersion(ExtDirPath() + '\manifest.json'), '{#AppVersion}');
end;

function UseDefaultExt(): Boolean;
begin
  Result := (FindAdoptedDir() = '') and ShouldCopyExt();
end;

function UseAdoptedExt(): Boolean;
begin
  Result := (FindAdoptedDir() <> '') and ShouldCopyExt();
end;

function AdoptedDirCode(Param: String): String;
begin
  Result := FindAdoptedDir();
end;

// rxalign-ids baglantisinin acacagi tarayici: eklentinin kuruldugu (secilen ya da zaten ekli olan) tarayici; Chrome oncelikli.
function ProtoBrowserExe(): String;
begin
  ExtInit();
  if (BrExe[BR_CHROME] <> '') and (BrWanted(BR_CHROME) or ExtensionInstalled(BR_CHROME) or (BrExe[BR_EDGE] = '')) then
    Result := BrExe[BR_CHROME]
  else if (BrExe[BR_EDGE] <> '') and (BrWanted(BR_EDGE) or ExtensionInstalled(BR_EDGE) or (BrExe[BR_CHROME] = '')) then
    Result := BrExe[BR_EDGE]
  else
    Result := BrExe[BR_CHROME];
end;

function HasProtoBrowser(): Boolean;
begin
  Result := ProtoBrowserExe() <> '';
end;

// "--" tarayicinin anahtar okumasini bitirir: baglantidan gelen metin anahtar olarak yorumlanamaz.
function ProtoCommand(Param: String): String;
begin
  Result := '"' + ProtoBrowserExe() + '" -- "https://rxalign.fgoapps.com/ids-ac.html#%1"';
end;

function HostJsonPath(Param: String): String;
begin
  Result := ExtDirPath() + '\updater\updater-host.json';
end;

// Yerel mesajlasma tanimi: UTF-8, BOM'suz (kullanici adinda Turkce harf olabilir).
procedure WriteHostJson();
var
  Bat, Json: String;
begin
  Bat := ExtDirPath() + '\updater\updater.bat';
  StringChangeEx(Bat, '\', '\\', True);
  Json := '{' + #13#10 +
    '  "name": "{#HostName}",' + #13#10 +
    '  "description": "IDS Yardimcisi guncelleyici",' + #13#10 +
    '  "path": "' + Bat + '",' + #13#10 +
    '  "type": "stdio",' + #13#10 +
    '  "allowed_origins": [ "chrome-extension://' + EXT_ID + '/" ]' + #13#10 +
    '}' + #13#10;
  if not SaveStringToFile(HostJsonPath(''), UTF8Encode(Json), False) then
    MsgBox('Güncelleyici tanımı yazılamadı; eklenti çalışır ama kendiliğinden güncellenmez.', mbError, MB_OK);
end;

procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssInstall then
    InstallStarted := True;
  if CurStep = ssPostInstall then
    WriteHostJson();
end;
