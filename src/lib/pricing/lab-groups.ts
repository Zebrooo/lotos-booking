export type LabGroup = {
  id: string;
  label: string;
  pattern: string;
};

export const LAB_GROUPS: LabGroup[] = [
  { id: "blood", label: "Анализы крови", pattern: "кров|глюкоз|гликирован|ферритин|желез|липид|холестер|креатинин|мочевин|билирубин|аминотрансферас|электролит|коагул|свертыван|фибриноген|тромбо|с-реактив" },
  { id: "hormones", label: "Гормоны", pattern: "гормон|щитовид|ттг|тиро|эстроген|прогест|андроген|тестостерон|пролактин|кортизол|инсулин|гипофиз|надпочеч|гонадотроп" },
  { id: "allergy", label: "Аллергия", pattern: "аллерг|immunocap|асит|ige|igе" },
  { id: "infections", label: "Инфекции", pattern: "инфекц|вирус|бактер|covid|sars|герпес|хламид|микоплазм|уреаплазм|сифилис|туберкул|стрептококк|стафилококк|гельминт|кандидоз|шигелл|сальмонелл|иппп|впч|папиллом|гепатит|вич|hiv|цитомегалов|эпштейн|мононуклеоз|паразит|простейш" },
  { id: "vitamins", label: "Витамины и минералы", pattern: "витамин|минерал|микроэлемент|макроэлемент|медь|цинк|селен|магни|кальций|калий|натрий|йод|фолиев|b12|b 12" },
  { id: "urine-stool", label: "Моча и кал", pattern: "моч|кал[а-я]*|копро" },
  { id: "oncology-genetics", label: "Онкология и генетика", pattern: "онко|генетик|геном|наследствен|фармакогенетик|мутаци|днк|карцином" },
  { id: "health", label: "Женское и мужское здоровье", pattern: "гинекол|женск|мужск|беременн|репродук|пренатал|сперм|простат|папаниколао|цитолог" },
];

export function labGroup(id: unknown): LabGroup | undefined {
  return typeof id === "string" ? LAB_GROUPS.find(group => group.id === id) : undefined;
}

export function matchesLabGroup(category: string, group: LabGroup): boolean {
  return new RegExp(group.pattern, "i").test(category);
}
