#!/usr/bin/env python3
"""合并《X 200 AI 博主》名单 + 现有账号，去重后写入 accounts.json。
数据块格式：每行 "handle 显示名"，handle 不带 @。全局按 handle 小写去重，先出现的分类优先。
"""
import json, os, re

ROOT = os.path.dirname(os.path.abspath(__file__))
HANDLE_RE = re.compile(r"^[A-Za-z0-9_]{1,15}$")

# (id, 名称, 颜色, 数据块) —— 顺序即去重优先级
CATS = []

def add(cid, name, color, block):
    CATS.append((cid, name, color, block))

# 官方与实验室（保留现有机构号，放最前）
add("labs", "官方与实验室", "#0ea5e9", """
OpenAI OpenAI
AnthropicAI Anthropic
GoogleDeepMind Google DeepMind
MetaAI Meta AI
xai xAI
nvidia NVIDIA
HuggingFace Hugging Face
""")
# 中文·提示词与 AI 技术专家
add("cn-tech", "中文 · 提示词与技术", "#ef4444", """
dotey 宝玉
lilianweng Lilian Weng
dongxi_nlp 马东锡
Barret_China Barret李靖
xicilion 响马
lidangzzz 立党老师
PMbackttfuture AI产品黄叔
Khazix0918 数字生命卡兹克
lxfater 铁锤人
hanqing_me 汗青
indigo11 芦义
shao__meng meng shao
wshuyi Wang Shuyi
HongyuanCao HongyuanCao
turingou 郭宇guoyu.eth
virushuo virushuo
idoubicc idoubi
xiongchun007 程序员老熊
Junyu Junyu Wang
CoderJeffLee 写增长的子木
iamtonyzhu Tony出海
readyfor2025 Moby
yihui_indie Yihui
""")
# 中文·AIGC 与创意
add("cn-aigc", "中文 · AIGC 与创意", "#f59e0b", """
op7418 归藏
ZHO_ZHO_ZHO -Zho-
hq4ai 汗青 HQ
berryxia Berryxia.AI
99aico JoJo 99AI
tangjinzhou tangjinzhou
dingyi Ding
iamluokai luokai
Yangyi Yangyi
haibun 海辛
Hayami_kiraa 早见Hayami
lijigang 李继刚
GlocalTerapy 七娘
fankaishuoai 范凯说AI
luinlee 子骅 Zihua Li
Cydiar404 Cydiar
ring_hyacinth Ring Hyacinth
sunyangphp Crypto军火库
IndieDevHailey 开发者Hailey
0xLaughing Laughing
t1anyufan Tianyu Fan
""")
# 中文·AI 产品与创业
add("cn-product", "中文 · 产品与创业", "#ec4899", """
vista8 向阳乔木
oran_ge 橘子
JefferyTatsuya 金田達也
XDash 范冰
thinkingjimmy JimmyWong
lewangx LE
AxtonLiu Axton
yupi996 程序员鱼皮
lifesinger Frank Wang 玉伯
Tumeng05 土猛的员外
servasyy_ai huangserva
lyc_zh lyc_zh
dontbesilent dontbesilent
Valley101_Qian 硅谷101陈茜
hongjun60 泓君Jane
daluoseo 大罗SEO
indie_maker_fox Fox@MkSaaS
tualatrix 图拉鼎
luoleiorg luolei
XiaohuiAI666 程序员小灰
plidezus 少楠Plidezus
JinsFavorites dangjin
nishuang 倪爽
austinit Austin
jesselaunz Jesse Lau 遁一子
""")
# 中文·资讯与工具
add("cn-news", "中文 · 资讯与工具", "#22c55e", """
Gorden_Sun Gorden Sun
xiaohu 小互
seclink Y11
WaytoAGI WaytoAGI
OwenYoungZh Owen
FinanceYF5 AI Will
fuxiangPro fuxiang
mranti Michael Anti
Fenng Fenng
tinyfool tinyfool
AlchainHust 花叔
SamuelQZQ DN-Samuel
elliotchen100 艾略特
abskoop ahhhhfs
RookieRicardoR 耳朵
yan5xu yan5xu
TradesMax 美股投资网
XClawLab XClaw
goocarlos Luyu Zhang
gefei55 哥飞
nateleex 李自然 Nate Lee
tuturetom Tom Huang
xds2000 Tommy Xiao
laobaishare 老白
recatm 夹喵
DigitalNomadLC 数字牧民LC
frank_8848 leon
AI_Jasonyu 鱼总聊AI
wangeguo 国子
""")
# 英文·研究先驱与科学家
add("en-research", "English · 研究先驱", "#6366f1", """
lexfridman Lex Fridman
sama Sam Altman
kaifulee Kai-Fu Lee 李开复
ID_AA_Carmack John Carmack
AndrewYNg Andrew Ng
karpathy Andrej Karpathy
2morrowknight Sean Gardner
ylecun Yann LeCun
Scobleizer Robert Scoble
drfeifei Fei-Fei Li
KirkDBorne Kirk Borne
fchollet François Chollet
rowancheung Rowan Cheung
antgrasso Antonio Grasso
demishassabis Demis Hassabis
Ronald_vanLoon Ronald van Loon
TamaraMcCleary Tamara McCleary
geoffreyhinton Geoffrey Hinton
goodfellow_ian Ian Goodfellow
jeffdean Jeff Dean
erikbryn Erik Brynjolfsson
timnitgebru Timnit Gebru
oriolvinyalsml Oriol Vinyals
ceobillionaire Vincent Boucher
soumithchintala Soumith Chintala
""")
# 英文·行业领袖与 CEO
add("en-leaders", "English · 行业领袖", "#a371f7", """
waitin4agi_ Varun Mayya
sallyeaves Sally Eaves
bernardmarr Bernard Marr
fabiomoioli Fabio Moioli
pascal_bornet Pascal Bornet
GaryMarcus Gary Marcus
thatroblennon Rob Lennon
randal_olson Randy Olson
Nicochan33 Nicolas Babin
chrismessina Chris Messina
iainljbrown Iain Brown
HaroldSinnott Harold Sinnott
DataChaz Data Chaz
mrgreen Lorenzo Green
NandoDF Nando de Freitas
clairesilver12 Claire Silver
katecrawford Kate Crawford
abhi1thakur Abhishek Thakur
yoheinakajima Yohei Nakajima
YuHelenYu Helen Yu
nigewillson Nige Roberts-Willson
_karenhao Karen Hao
nathanlands Nathan Lands
ingliguori Giuliano Liguori
mrogati Monica Rogati
""")
# 英文·内容创作者与教育者
add("en-creators", "English · 创作者与教育", "#14b8a6", """
oliverchristie Oliver Christie
mfordfuture Martin Ford
nathanbenaich Nathan Benaich
terenceleungsf Terence Leung
alliekmiller Allie Miller
CatherineAdenle Catherine Adenle
bilawalsidhu Bilawal Sidhu
marcusborba Marcus Borba
miketamir Mike Tamir
grok_ Kate Darling
vinod1975 Vinod Sharma
svenphilipsen Sven Philipsen
bamitav Amitav Bhattacharjee
fogoros Lucian Fogoros
CadeMetz Cade Metz
rodneyabrooks Rodney Brooks
wellingmax Max Welling
marktabnet Mark Tabladillo
etzioni Oren Etzioni
alexjc Alex J. Champandard
genekogan Gene Kogan
mjrobbins Martin F. Robbins
localghost Aaron Ng
bobgourley Bob Gourley
andyjankowski Andy Jankowski
""")
# 英文·分析师与伦理学家
add("en-analysts", "English · 分析师与伦理", "#84cc16", """
paulroetzer Paul Roetzer
SourabhSKatoch Sourabh Singh Katoch
bobviolino Bob Violino
terence_mills Terence Mills
johnchavens John C. Havens
debashis_dutta Debashis Dutta
davidwkenny David Kenny
learnopencv Satya Mallick
petitegeek Dr. Angelica Lim
faustospain Fausto P. Garcia Marquez
wil_bielert Wilhelm Bielert
sarahburnett Sarah Burnett
marek_rosa Marek Rosa
sudalairajkumar Sudalai Rajkumar
hsryueli YueLi-HSR
Whats_AI Louis Bouchard
inma_martinez Inma Martinez
pandeyajay7 Ajay Pandey
kath0134 Kathleen Walch
ibarkin Ian Barkin
rschmelzer Ronald Schmelzer
jainkunal Kunal Jain
DaphneKoller Daphne Koller
mvollmer1 Marcell Vollmer
SullyOmarr Sully
""")
# 比特币 & 加密核心（英文）
add("crypto-core", "加密 · BTC & 宏观", "#f7931a", """
saylor Michael Saylor
APompliano Anthony Pompliano
100trillionUSD PlanB
woonomic Willy Woo
LynAldenContact Lyn Alden
CryptoHayes Arthur Hayes
zachxbt ZachXBT
VitalikButerin Vitalik Buterin
cz_binance CZ 赵长鹏
balajis Balaji Srinivasan
""")
# 中文·加密 / 比特币
add("crypto-cn", "加密 · 中文区", "#fbbf24", """
ChandlerGuo 宝二爷
PhyrexNi Phyrex
wublockchain12 吴说区块链
bitfish DiscusFish
Jiangzhuoer2 江卓尔
Jackyi_ld 易理华
liujiaolian 刘教链
tmel0211 tmel
evilcos 余弦
jiqizhixin 机器之心
""")
# 财经 / 宏观 / 投资（FinTwit）
add("fintwit", "财经 · 宏观投资", "#10b981", """
charliebilello Charlie Bilello
LizAnnSonders Liz Ann Sonders
morganhousel Morgan Housel
naval Naval Ravikant
BrianFeroldi Brian Feroldi
AswathDamodaran Aswath Damodaran
pmarca Marc Andreessen
cdixon Chris Dixon
andrewchen Andrew Chen
""")
# 中文·出海 & SaaS 增长
add("cn-oversea", "中文 · 出海 & 增长", "#0ea5e9", """
nextify2024 nextify
weijunext 廖伟俊
JourneymanChina Journeyman
dev_afei 阿飞
luobogooooo 萝卜
GoSailGlobal GoSail
chuhaiqu 出海去
santiagoyoungus Santiago
""")
# 中文·独立开发者
add("cn-indie", "中文 · 独立开发者", "#8b5cf6", """
guishou_56 鬼手
9yearfish 九年鱼
benshandebiao 本善
hwwaanng Wang
waylybaye 拜宝
randyloop Randy
livid Livid
shengxj1 盛
liuyi0922 刘毅
fkysly 风口世里
zhixianio 知闲
Pluvio9yte Pluvio
cellinlab cellin
kasong2048 kasong
""")
# 中文·海外手机卡 / eSIM / 数字游民
add("cn-esim", "中文 · eSIM & 数字游民", "#06b6d4", """
realNyarime 奶昔
RocM301 RocM
EvaCmore Eva
shuziyimin 数字移民
itangtalk iTang
expatlevi Levi
""")
# 中文·知识与副业
add("cn-knowledge", "中文 · 知识与副业", "#eab308", """
ruanyf 阮一峰
Svwang1 Svwang
sspai_com 少数派
pongba 刘未鹏
Francis_YAO_ Francis Yao
foxshuo Fox说
Astronaut_1216 宇航员
ityouknows 纯洁的微笑
""")
# 既有 builder/工具/机器人账号（保留，放最后，去重）
add("builders", "Builder / 工具 / 其他", "#94a3b8", """
gdb Greg Brockman
DarioAmodei Dario Amodei
elonmusk Elon Musk
JimFan Jim Fan
simonw Simon Willison
rasbt Sebastian Raschka
swyx Shawn Wang
jeremyphoward Jeremy Howard
SchmidhuberAI Jürgen Schmidhuber
OfficialLoganK Logan Kilpatrick
mattshumer_ Matt Shumer
petergyang Peter Yang
theo Theo
levelsio levelsio
vikhyatk Vikhyat
steipete Peter Steinberger
openclaw OpenClaw
AlexFinn Alex Finn
MatthewBerman Matthew Berman
LiorOnAI Lior
Codie_Sanchez Codie Sanchez
ideabrowser Idea Browser
gregisenberg Greg Isenberg
CuiMao CuiMao
""")

# twitterapi.io user/info 校验为 user not found 的无效账号（改名/注销/拼写错误），从源头剔除
INVALID = {
    "hanqing_me", "indigo11", "sunyangphp", "lyc_zh",
    "clairesilver12", "kath0134", "woonomic", "expatlevi",
}


def build():
    seen, cats_out = set(), []
    for cid, name, color, block in CATS:
        accs = []
        for line in block.strip().splitlines():
            line = line.strip()
            if not line:
                continue
            parts = line.split(None, 1)
            h = parts[0].lstrip("@")
            disp = parts[1].strip() if len(parts) > 1 else h
            if not HANDLE_RE.match(h):
                print("跳过非法 handle:", repr(line)); continue
            if h.lower() in INVALID:
                continue
            if h.lower() in seen:
                continue
            seen.add(h.lower())
            accs.append({"handle": h, "name": disp, "desc": ""})
        cats_out.append({"id": cid, "name": name, "color": color, "accounts": accs})
    return {"categories": cats_out}

if __name__ == "__main__":
    data = build()
    path = os.path.join(ROOT, "accounts.json")
    if os.path.exists(path):
        os.replace(path, path + ".bak")
    with open(path, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    total = sum(len(c["accounts"]) for c in data["categories"])
    print("已写入 accounts.json：%d 分类，%d 账号" % (len(data["categories"]), total))
    for c in data["categories"]:
        print("  %-12s %s: %d" % (c["id"], c["name"], len(c["accounts"])))
