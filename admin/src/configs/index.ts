import { CrudConfig } from "../configs/types";
import { classesConfig } from "./domains/classes";
import { itemsConfig } from "./domains/items";
import { statModelsConfig } from "./domains/statModels";
import { shopProductsConfig } from "./domains/shopProducts";
import { patchNotesConfig } from "./domains/patchNotes";
import { craftRecipesConfig } from "./domains/craftRecipes";
import { boostersConfig } from "./domains/boosters";

// Registro central de configs de CRUD.
// Para adicionar uma nova entidade: crie src/configs/domains/<entidade>.ts
// exportando `<entidade>Config: CrudConfig` e adicione ao array abaixo.
export const crudConfigs: CrudConfig[] = [
  classesConfig,
  itemsConfig,
  statModelsConfig,
  shopProductsConfig,
  patchNotesConfig,
  craftRecipesConfig,
  boostersConfig,
];
