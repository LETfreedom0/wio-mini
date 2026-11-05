/**
 * 2027年节假日安排
 * 数据来源: 国务院办公厅关于2027年部分节假日安排的通知（国办发明电〔2026〕10号）
 * https://www.gov.cn/zhengce/content/202611/content_7085101.htm
 * 一、元旦: 1月1日(周五)至3日(周日)放假，共3天。
 * 二、春节: 2月5日(除夕、周五)至13日(初八、周六)放假调休，共9天。1月31日(周日)、2月14日(周日)上班。
 * 三、清明节: 4月3日(周六)至5日(周一)放假，共3天。
 * 四、劳动节: 5月1日(周六)至5日(周三)放假调休，共5天。5月8日(周六)上班。
 * 五、端午节: 6月9日(周三)放假，共1天。
 * 六、中秋节: 9月15日(周三)放假，共1天。
 * 七、国庆节: 10月1日(周五)至7日(周四)放假调休，共7天。9月26日(周日)、10月9日(周六)上班。
 */
export const holidays2027 = {
    "$schema": "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/schema.json",
    "$id": "https://raw.githubusercontent.com/NateScarlet/holiday-cn/master/2027.json",
    "year": 2027,
    "papers": [
        "https://www.gov.cn/zhengce/content/202611/content_7085101.htm"
    ],
    "days": [
        // 元旦 1/1(五)–1/3(日)，与周末自然相连，无调休
        { "name": "元旦", "date": "2027-01-01", "isOffDay": true },
        { "name": "元旦", "date": "2027-01-02", "isOffDay": true },
        { "name": "元旦", "date": "2027-01-03", "isOffDay": true },

        // 春节 2/5(除夕)–2/13，共 9 天；1/31(日)、2/14(日) 调休上班
        { "name": "春节", "date": "2027-01-31", "isOffDay": false },
        { "name": "春节", "date": "2027-02-05", "isOffDay": true },
        { "name": "春节", "date": "2027-02-06", "isOffDay": true },
        { "name": "春节", "date": "2027-02-07", "isOffDay": true },
        { "name": "春节", "date": "2027-02-08", "isOffDay": true },
        { "name": "春节", "date": "2027-02-09", "isOffDay": true },
        { "name": "春节", "date": "2027-02-10", "isOffDay": true },
        { "name": "春节", "date": "2027-02-11", "isOffDay": true },
        { "name": "春节", "date": "2027-02-12", "isOffDay": true },
        { "name": "春节", "date": "2027-02-13", "isOffDay": true },
        { "name": "春节", "date": "2027-02-14", "isOffDay": false },

        // 清明节 4/3(六)–4/5(一)，与周末自然相连，无调休
        { "name": "清明节", "date": "2027-04-03", "isOffDay": true },
        { "name": "清明节", "date": "2027-04-04", "isOffDay": true },
        { "name": "清明节", "date": "2027-04-05", "isOffDay": true },

        // 劳动节 5/1(六)–5/5(三)，共 5 天；5/8(六) 调休上班
        { "name": "劳动节", "date": "2027-05-01", "isOffDay": true },
        { "name": "劳动节", "date": "2027-05-02", "isOffDay": true },
        { "name": "劳动节", "date": "2027-05-03", "isOffDay": true },
        { "name": "劳动节", "date": "2027-05-04", "isOffDay": true },
        { "name": "劳动节", "date": "2027-05-05", "isOffDay": true },
        { "name": "劳动节", "date": "2027-05-08", "isOffDay": false },

        // 端午节 6/9(周三)，单日
        { "name": "端午节", "date": "2027-06-09", "isOffDay": true },

        // 中秋节 9/15(周三)，单日
        { "name": "中秋节", "date": "2027-09-15", "isOffDay": true },

        // 国庆节 10/1(五)–10/7(四)，共 7 天；9/26(日)、10/9(六) 调休上班
        { "name": "国庆节", "date": "2027-09-26", "isOffDay": false },
        { "name": "国庆节", "date": "2027-10-01", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-02", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-03", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-04", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-05", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-06", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-07", "isOffDay": true },
        { "name": "国庆节", "date": "2027-10-09", "isOffDay": false }
    ]
};
